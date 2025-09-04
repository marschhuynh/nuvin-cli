package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// MCPStdioProcess represents a running MCP server process
type MCPStdioProcess struct {
	ID        string
	Command   string
	Args      []string
	Env       map[string]string
	Process   *exec.Cmd
	Stdin     io.WriteCloser
	Stdout    io.ReadCloser
	Stderr    io.ReadCloser
	Context   context.Context
	Cancel    context.CancelFunc
	StartTime time.Time
	Events    chan MCPStdioEvent
	mutex     sync.RWMutex
	running   bool
}

// MCPStdioEvent represents an event from the MCP process
type MCPStdioEvent struct {
	Type      string `json:"type"`      // stdout, stderr, error, exit
	Content   string `json:"content"`   // message content
	Timestamp time.Time `json:"timestamp"`
}

// MCPStdioStartRequest represents a request to start an MCP stdio process
type MCPStdioStartRequest struct {
	ProcessID string            `json:"processId" binding:"required"`
	Command   string            `json:"command" binding:"required"`
	Args      []string          `json:"args,omitempty"`
	Env       map[string]string `json:"env,omitempty"`
}

// MCPStdioSendRequest represents a request to send data to stdin
type MCPStdioSendRequest struct {
	ProcessID string `json:"processId" binding:"required"`
	Data      string `json:"data" binding:"required"`
}

// MCPStdioStopRequest represents a request to stop a process
type MCPStdioStopRequest struct {
	ProcessID string `json:"processId" binding:"required"`
}

// Global process manager
var (
	mcpProcesses = make(map[string]*MCPStdioProcess)
	processMutex sync.RWMutex
)

// MCPStdioStart starts a new MCP stdio process
func MCPStdioStart(c *gin.Context) {
	var req MCPStdioStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	processMutex.Lock()
	defer processMutex.Unlock()

	// Check if process already exists
	if _, exists := mcpProcesses[req.ProcessID]; exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Process ID already exists"})
		return
	}

	// Security check: Basic command validation
	if req.Command == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Command cannot be empty"})
		return
	}

	// Create context for the process
	ctx, cancel := context.WithCancel(context.Background())

	// Create the command
	cmd := exec.CommandContext(ctx, req.Command, req.Args...)

	// Set environment variables
	if len(req.Env) > 0 {
		env := os.Environ()
		for key, value := range req.Env {
			env = append(env, fmt.Sprintf("%s=%s", key, value))
		}
		cmd.Env = env
	}

	// Get pipes for stdin, stdout, stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create stdin pipe: %v", err)})
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		cancel()
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create stdout pipe: %v", err)})
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdin.Close()
		stdout.Close()
		cancel()
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create stderr pipe: %v", err)})
		return
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		stdin.Close()
		stdout.Close()
		stderr.Close()
		cancel()
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to start process: %v", err)})
		return
	}

	// Create process object
	process := &MCPStdioProcess{
		ID:        req.ProcessID,
		Command:   req.Command,
		Args:      req.Args,
		Env:       req.Env,
		Process:   cmd,
		Stdin:     stdin,
		Stdout:    stdout,
		Stderr:    stderr,
		Context:   ctx,
		Cancel:    cancel,
		StartTime: time.Now(),
		Events:    make(chan MCPStdioEvent, 100), // Buffered channel
		running:   true,
	}

	// Store the process
	mcpProcesses[req.ProcessID] = process

	// Start goroutines to handle stdout/stderr
	go process.handleOutput()
	go process.waitForExit()

	c.JSON(http.StatusOK, gin.H{
		"processId": req.ProcessID,
		"status":    "started",
		"pid":       cmd.Process.Pid,
	})
}

// MCPStdioSend sends data to the process stdin
func MCPStdioSend(c *gin.Context) {
	var req MCPStdioSendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	processMutex.RLock()
	process, exists := mcpProcesses[req.ProcessID]
	processMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Process not found"})
		return
	}

	process.mutex.RLock()
	running := process.running
	stdin := process.Stdin
	process.mutex.RUnlock()

	if !running {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Process is not running"})
		return
	}

	// Send data to stdin
	if _, err := stdin.Write([]byte(req.Data)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to write to stdin: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "sent"})
}

// MCPStdioStop stops a running process
func MCPStdioStop(c *gin.Context) {
	var req MCPStdioStopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	processMutex.Lock()
	process, exists := mcpProcesses[req.ProcessID]
	if exists {
		delete(mcpProcesses, req.ProcessID)
	}
	processMutex.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Process not found"})
		return
	}

	// Stop the process
	process.stop()

	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}

// MCPStdioEvents handles SSE connections for process events
func MCPStdioEvents(c *gin.Context) {
	processID := c.Param("processId")
	if processID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Process ID is required"})
		return
	}

	processMutex.RLock()
	process, exists := mcpProcesses[processID]
	processMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Process not found"})
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	// Create a done channel to signal when client disconnects
	done := make(chan bool)
	
	// Handle client disconnect
	c.Stream(func(w io.Writer) bool {
		select {
		case event := <-process.Events:
			// Send SSE event
			eventData, _ := json.Marshal(event)
			fmt.Fprintf(w, "data: %s\n\n", eventData)
			return true
		case <-done:
			return false
		case <-process.Context.Done():
			// Process ended
			return false
		case <-time.After(30 * time.Second):
			// Send keepalive
			fmt.Fprintf(w, "data: {\"type\":\"keepalive\"}\n\n")
			return true
		}
	})
}

// handleOutput reads from stdout/stderr and sends events
func (p *MCPStdioProcess) handleOutput() {
	// Handle stdout
	go func() {
		scanner := bufio.NewScanner(p.Stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if line != "" {
				select {
				case p.Events <- MCPStdioEvent{
					Type:      "stdout",
					Content:   line,
					Timestamp: time.Now(),
				}:
				default:
					// Channel full, skip
				}
			}
		}
	}()

	// Handle stderr
	go func() {
		scanner := bufio.NewScanner(p.Stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if line != "" {
				select {
				case p.Events <- MCPStdioEvent{
					Type:      "stderr",
					Content:   line,
					Timestamp: time.Now(),
				}:
				default:
					// Channel full, skip
				}
			}
		}
	}()
}

// waitForExit waits for the process to exit
func (p *MCPStdioProcess) waitForExit() {
	err := p.Process.Wait()
	
	p.mutex.Lock()
	p.running = false
	p.mutex.Unlock()

	// Send exit event
	exitEvent := MCPStdioEvent{
		Type:      "exit",
		Timestamp: time.Now(),
	}
	
	if err != nil {
		exitEvent.Content = fmt.Sprintf("Process exited with error: %v", err)
	} else {
		exitEvent.Content = "Process exited successfully"
	}

	select {
	case p.Events <- exitEvent:
	default:
		// Channel full, skip
	}

	// Close pipes
	p.Stdin.Close()
	p.Stdout.Close()
	p.Stderr.Close()
	
	// Cancel context
	p.Cancel()

	// Remove from global map
	processMutex.Lock()
	delete(mcpProcesses, p.ID)
	processMutex.Unlock()

	log.Printf("MCP stdio process %s exited", p.ID)
}

// stop terminates the process
func (p *MCPStdioProcess) stop() {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	if !p.running {
		return
	}

	// Try graceful shutdown first
	if p.Process != nil && p.Process.Process != nil {
		p.Process.Process.Signal(os.Interrupt)
		
		// Wait a bit for graceful shutdown
		done := make(chan error, 1)
		go func() {
			done <- p.Process.Wait()
		}()

		select {
		case <-done:
			// Process exited gracefully
		case <-time.After(5 * time.Second):
			// Force kill if not exited
			p.Process.Process.Kill()
		}
	}

	// Cancel context
	p.Cancel()
	p.running = false
}

// MCPStdioStatus returns the status of all processes
func MCPStdioStatus(c *gin.Context) {
	processMutex.RLock()
	defer processMutex.RUnlock()

	status := make(map[string]interface{})
	for id, process := range mcpProcesses {
		process.mutex.RLock()
		status[id] = map[string]interface{}{
			"id":        process.ID,
			"command":   process.Command,
			"args":      process.Args,
			"running":   process.running,
			"startTime": process.StartTime,
			"pid":       0,
		}
		if process.Process != nil && process.Process.Process != nil {
			status[id].(map[string]interface{})["pid"] = process.Process.Process.Pid
		}
		process.mutex.RUnlock()
	}

	c.JSON(http.StatusOK, gin.H{"processes": status})
}