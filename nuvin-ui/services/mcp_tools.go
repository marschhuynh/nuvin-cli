package services

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"sync"
	"time"

	runtime "nuvin-ui/internal/v3compat"
)

// MCPProcess represents a running MCP server process
type MCPProcess struct {
	ID     string
	Cmd    *exec.Cmd
	Stdin  io.WriteCloser
	Stdout io.ReadCloser
	Stderr io.ReadCloser
	Cancel context.CancelFunc
	Done   chan error
}

// MCPRequest represents a request to start an MCP server
type MCPRequest struct {
	ID      string            `json:"id"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
}

// MCPMessage represents a JSON-RPC message
type MCPMessage struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id,omitempty"`
	Method  string      `json:"method,omitempty"`
	Params  interface{} `json:"params,omitempty"`
	Result  interface{} `json:"result,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

// MCPToolsService provides MCP server management functionality
type MCPToolsService struct {
	ctx          context.Context
	mcpProcesses map[string]*MCPProcess
	mcpMutex     sync.RWMutex
}

// NewMCPToolsService creates a new MCP tools service
func NewMCPToolsService() *MCPToolsService {
	return &MCPToolsService{
		mcpProcesses: make(map[string]*MCPProcess),
	}
}

// OnStartup initializes the MCP tools service
func (s *MCPToolsService) OnStartup(ctx context.Context) {
	s.ctx = ctx
}

// StartMCPServer starts an MCP server process
func (s *MCPToolsService) StartMCPServer(mcpReq MCPRequest) error {
	runtime.LogInfo(s.ctx, fmt.Sprintf("Starting MCP server: %s %v", mcpReq.Command, mcpReq.Args))

	s.mcpMutex.Lock()
	defer s.mcpMutex.Unlock()

	// Check if process already exists
	if _, exists := s.mcpProcesses[mcpReq.ID]; exists {
		return fmt.Errorf("MCP server %s already running", mcpReq.ID)
	}

	// Create command context with cancellation
	ctx, cancel := context.WithCancel(context.Background())

	// Parse command and arguments - handle space-separated commands
	var cmdName string
	var cmdArgs []string

	if len(mcpReq.Args) > 0 {
		// Use provided command and args
		cmdName = mcpReq.Command
		cmdArgs = mcpReq.Args
	} else {
		// Parse space-separated command (for backward compatibility)
		parts := strings.Fields(mcpReq.Command)
		if len(parts) == 0 {
			cancel()
			return fmt.Errorf("empty command")
		}
		cmdName = parts[0]
		cmdArgs = parts[1:]
	}

	// Resolve command path if it's not already a full path
	originalCmd := cmdName
	if !filepath.IsAbs(cmdName) {
		if resolvedPath := s.resolveCommandPath(cmdName); resolvedPath != "" {
			cmdName = resolvedPath
			runtime.LogInfo(s.ctx, fmt.Sprintf("Resolved command '%s' to '%s'", originalCmd, cmdName))
		} else {
			runtime.LogWarning(s.ctx, fmt.Sprintf("Command '%s' not found in PATH or common locations", originalCmd))
		}
	}

	runtime.LogInfo(s.ctx, fmt.Sprintf("Executing command: %s with args: %v", cmdName, cmdArgs))
	cmd := exec.CommandContext(ctx, cmdName, cmdArgs...)

	// Set environment variables with enhanced PATH
	cmd.Env = s.buildEnhancedEnvironment()
	for key, value := range mcpReq.Env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	// Create pipes for stdin/stdout/stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("failed to create stdin pipe: %v", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		stdin.Close()
		return fmt.Errorf("failed to create stdout pipe: %v", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		stdin.Close()
		stdout.Close()
		return fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		cancel()
		stdin.Close()
		stdout.Close()
		stderr.Close()
		return fmt.Errorf("failed to start MCP server: %v", err)
	}

	// Create process tracking structure
	process := &MCPProcess{
		ID:     mcpReq.ID,
		Cmd:    cmd,
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Cancel: cancel,
		Done:   make(chan error, 1),
	}

	// Store the process
	s.mcpProcesses[mcpReq.ID] = process

	// Start monitoring goroutines
	go s.monitorMCPProcess(process)
	go s.forwardMCPStdout(process)
	go s.forwardMCPStderr(process)

	runtime.LogInfo(s.ctx, fmt.Sprintf("MCP server %s started with PID %d", mcpReq.ID, cmd.Process.Pid))
	return nil
}

// StopMCPServer stops an MCP server process
func (s *MCPToolsService) StopMCPServer(serverID string) error {
	runtime.LogInfo(s.ctx, fmt.Sprintf("Stopping MCP server: %s", serverID))

	s.mcpMutex.Lock()
	defer s.mcpMutex.Unlock()

	process, exists := s.mcpProcesses[serverID]
	if !exists {
		return fmt.Errorf("MCP server %s not found", serverID)
	}

	// Cancel the context to stop the process
	process.Cancel()

	// Close stdin to signal the process to terminate gracefully
	process.Stdin.Close()

	// Wait for the process to finish or force kill after timeout
	go func() {
		time.Sleep(10 * time.Second)
		if process.Cmd.Process != nil {
			runtime.LogWarning(s.ctx, fmt.Sprintf("Force killing MCP server %s", serverID))
			process.Cmd.Process.Kill()
		}
	}()

	// Wait for process to finish
	<-process.Done

	// Clean up
	delete(s.mcpProcesses, serverID)

	runtime.LogInfo(s.ctx, fmt.Sprintf("MCP server %s stopped", serverID))
	return nil
}

// StopAllMCPServers stops all running MCP server processes
func (s *MCPToolsService) StopAllMCPServers() error {
	runtime.LogInfo(s.ctx, "Stopping all MCP servers")

	s.mcpMutex.Lock()
	serverIDs := make([]string, 0, len(s.mcpProcesses))
	for serverID := range s.mcpProcesses {
		serverIDs = append(serverIDs, serverID)
	}
	s.mcpMutex.Unlock()

	var lastError error
	for _, serverID := range serverIDs {
		if err := s.StopMCPServer(serverID); err != nil {
			runtime.LogError(s.ctx, fmt.Sprintf("Failed to stop MCP server %s: %v", serverID, err))
			lastError = err
		}
	}

	runtime.LogInfo(s.ctx, fmt.Sprintf("Stopped %d MCP servers", len(serverIDs)))
	return lastError
}

// SendMCPMessage sends a JSON-RPC message to an MCP server
func (s *MCPToolsService) SendMCPMessage(serverID string, message MCPMessage) error {
	s.mcpMutex.RLock()
	process, exists := s.mcpProcesses[serverID]
	s.mcpMutex.RUnlock()

	if !exists {
		return fmt.Errorf("MCP server %s not found", serverID)
	}

	// Serialize message to JSON
	jsonData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	// Send as plain JSON with newline (NDJSON format)
	// Some MCP servers (like Context7) don't support Content-Length framing
	payload := append(jsonData, '\n')

	if _, err := process.Stdin.Write(payload); err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	runtime.LogInfo(s.ctx, fmt.Sprintf("Sent MCP message to %s: %s", serverID, string(jsonData)))
	return nil
}

// GetMCPServerStatus returns the status of all MCP servers
func (s *MCPToolsService) GetMCPServerStatus() map[string]string {
	s.mcpMutex.RLock()
	defer s.mcpMutex.RUnlock()

	status := make(map[string]string)
	for id, process := range s.mcpProcesses {
		if process.Cmd.Process != nil && process.Cmd.ProcessState == nil {
			status[id] = "running"
		} else {
			status[id] = "stopped"
		}
	}

	return status
}

// monitorMCPProcess monitors the process and handles completion
func (s *MCPToolsService) monitorMCPProcess(process *MCPProcess) {
	err := process.Cmd.Wait()
	process.Done <- err

	if err != nil {
		runtime.LogError(s.ctx, fmt.Sprintf("MCP server %s exited with error: %v", process.ID, err))
		runtime.EventsEmit(s.ctx, "mcp-server-error", map[string]interface{}{
			"serverId": process.ID,
			"error":    err.Error(),
		})
	} else {
		runtime.LogInfo(s.ctx, fmt.Sprintf("MCP server %s exited cleanly", process.ID))
	}

	runtime.EventsEmit(s.ctx, "mcp-server-stopped", map[string]interface{}{
		"serverId": process.ID,
	})
}

// forwardMCPStdout forwards stdout from MCP server to frontend
func (s *MCPToolsService) forwardMCPStdout(process *MCPProcess) {
	reader := bufio.NewReader(process.Stdout)

	runtime.LogInfo(s.ctx, fmt.Sprintf("Starting stdout forwarding for MCP server %s", process.ID))

	// Test event emission to verify Wails3 event system
	runtime.EventsEmit(s.ctx, "test-event", map[string]interface{}{
		"message":   "Test event from MCP stdout forwarding",
		"serverId":  process.ID,
		"timestamp": fmt.Sprintf("%d", time.Now().Unix()),
	})

	// Simplified approach: read line by line and try to parse as JSON
	// This handles both NDJSON and framed formats more reliably
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				runtime.LogInfo(s.ctx, fmt.Sprintf("MCP %s stdout EOF - process ended", process.ID))
				return
			}
			runtime.LogError(s.ctx, fmt.Sprintf("Error reading MCP %s stdout line: %v", process.ID, err))
			return
		}

		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			// Skip empty lines
			continue
		}

		runtime.LogInfo(s.ctx, fmt.Sprintf("MCP %s stdout: %s", process.ID, line))

		// Try to parse as JSON-RPC message
		var message MCPMessage
		if err := json.Unmarshal([]byte(line), &message); err == nil && (message.Method != "" || message.ID != nil || message.Result != nil || message.Error != nil) {
			runtime.LogInfo(s.ctx, fmt.Sprintf("Emitting mcp-message for %s: %+v", process.ID, message))
			runtime.EventsEmit(s.ctx, "mcp-message", map[string]interface{}{
				"serverId": process.ID,
				"message":  message,
			})
		} else {
			// Not a JSON-RPC message, emit as stdout
			runtime.LogInfo(s.ctx, fmt.Sprintf("Emitting mcp-stdout for %s (not JSON-RPC): %s", process.ID, line))
			runtime.EventsEmit(s.ctx, "mcp-stdout", map[string]interface{}{
				"serverId": process.ID,
				"data":     line,
			})
		}
	}
}

// forwardMCPStderr forwards stderr from MCP server to frontend
func (s *MCPToolsService) forwardMCPStderr(process *MCPProcess) {
	scanner := bufio.NewScanner(process.Stderr)
	for scanner.Scan() {
		line := scanner.Text()
		runtime.LogDebug(s.ctx, fmt.Sprintf("MCP %s stderr: %s", process.ID, line))
		runtime.EventsEmit(s.ctx, "mcp-stderr", map[string]interface{}{
			"serverId": process.ID,
			"data":     line,
		})
	}
	if err := scanner.Err(); err != nil {
		runtime.LogError(s.ctx, fmt.Sprintf("Error reading MCP %s stderr: %v", process.ID, err))
	}
}

// resolveCommandPath attempts to find the full path to a command
func (s *MCPToolsService) resolveCommandPath(cmdName string) string {
	// First try exec.LookPath with enhanced environment
	env := s.buildEnhancedEnvironment()

	// Create a temporary PATH for lookup
	var enhancedPath string
	for _, envVar := range env {
		if strings.HasPrefix(envVar, "PATH=") {
			enhancedPath = strings.TrimPrefix(envVar, "PATH=")
			break
		}
	}

	// Save current PATH and set enhanced PATH temporarily
	originalPath := os.Getenv("PATH")
	if enhancedPath != "" {
		os.Setenv("PATH", enhancedPath)
		defer os.Setenv("PATH", originalPath)
	}

	if path, err := exec.LookPath(cmdName); err == nil {
		return path
	}

	// Fallback: check common installation directories
	commonPaths := s.getCommonBinaryPaths()
	for _, dir := range commonPaths {
		fullPath := filepath.Join(dir, cmdName)
		if s.isExecutable(fullPath) {
			return fullPath
		}
	}

	return ""
}

// buildEnhancedEnvironment creates an environment with enhanced PATH
func (s *MCPToolsService) buildEnhancedEnvironment() []string {
	env := os.Environ()

	// Get current PATH
	currentPath := os.Getenv("PATH")

	// Get enhanced PATH from user's shell
	shellPath := s.getShellPath()

	// Get common binary paths
	commonPaths := s.getCommonBinaryPaths()

	// Combine all paths, removing duplicates
	pathMap := make(map[string]bool)
	var enhancedPathParts []string

	// Add current PATH first
	for _, part := range strings.Split(currentPath, ":") {
		if part != "" && !pathMap[part] {
			pathMap[part] = true
			enhancedPathParts = append(enhancedPathParts, part)
		}
	}

	// Add shell PATH
	for _, part := range strings.Split(shellPath, ":") {
		if part != "" && !pathMap[part] {
			pathMap[part] = true
			enhancedPathParts = append(enhancedPathParts, part)
		}
	}

	// Add common paths
	for _, part := range commonPaths {
		if part != "" && !pathMap[part] {
			pathMap[part] = true
			enhancedPathParts = append(enhancedPathParts, part)
		}
	}

	enhancedPath := strings.Join(enhancedPathParts, ":")
	runtime.LogInfo(s.ctx, fmt.Sprintf("Enhanced PATH: %s", enhancedPath))

	// Replace PATH in environment
	var newEnv []string
	pathSet := false
	for _, envVar := range env {
		if strings.HasPrefix(envVar, "PATH=") {
			newEnv = append(newEnv, "PATH="+enhancedPath)
			pathSet = true
		} else {
			newEnv = append(newEnv, envVar)
		}
	}

	// Add PATH if it wasn't in the original environment
	if !pathSet {
		newEnv = append(newEnv, "PATH="+enhancedPath)
	}

	return newEnv
}

// getShellPath gets the PATH from the user's shell environment
func (s *MCPToolsService) getShellPath() string {
	// Get current user
	currentUser, err := user.Current()
	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Could not get current user: %v", err))
		return ""
	}

	// Try to get PATH from user's shell
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash" // default fallback
	}

	// Use login shell to get full environment
	cmd := exec.Command(shell, "-l", "-c", "echo $PATH")
	cmd.Dir = currentUser.HomeDir

	if output, err := cmd.Output(); err == nil {
		path := strings.TrimSpace(string(output))
		if path != "" {
			runtime.LogInfo(s.ctx, fmt.Sprintf("Got PATH from shell (%s): %s", shell, path))
			return path
		}
	} else {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Could not get PATH from shell %s: %v", shell, err))
	}

	return ""
}

// getCommonBinaryPaths returns common directories where binaries are installed
func (s *MCPToolsService) getCommonBinaryPaths() []string {
	currentUser, err := user.Current()
	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Could not get current user for common paths: %v", err))
		return []string{"/usr/local/bin", "/usr/bin", "/bin"}
	}

	homeDir := currentUser.HomeDir

	return []string{
		// System paths
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		"/opt/homebrew/bin",       // Homebrew on Apple Silicon
		"/usr/local/homebrew/bin", // Homebrew on Intel Mac

		// User-specific paths
		filepath.Join(homeDir, ".local", "bin"),      // pip --user, uv, etc.
		filepath.Join(homeDir, "bin"),                // User binaries
		filepath.Join(homeDir, ".cargo", "bin"),      // Rust/cargo binaries
		filepath.Join(homeDir, "go", "bin"),          // Go binaries
		filepath.Join(homeDir, ".npm-global", "bin"), // npm global binaries
		filepath.Join(homeDir, ".yarn", "bin"),       // Yarn binaries

		// Node version managers
		filepath.Join(homeDir, ".nvm", "current", "bin"),
		filepath.Join(homeDir, ".fnm", "current", "bin"),

		// Python version managers
		filepath.Join(homeDir, ".pyenv", "shims"),

		// Ruby version managers
		filepath.Join(homeDir, ".rbenv", "shims"),
		filepath.Join(homeDir, ".rvm", "bin"),
	}
}

// isExecutable checks if a file exists and is executable
func (s *MCPToolsService) isExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}

	// Check if it's a regular file and has execute permission
	return info.Mode().IsRegular() && (info.Mode()&0111) != 0
}
