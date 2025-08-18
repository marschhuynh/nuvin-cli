package main

import (
    "bufio"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "os"
    "os/exec"
    "strings"
    "time"

    "github.com/wailsapp/wails/v2/pkg/runtime"
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

// StartMCPServer starts an MCP server process
func (a *App) StartMCPServer(mcpReq MCPRequest) error {
    runtime.LogInfo(a.ctx, fmt.Sprintf("Starting MCP server: %s %v", mcpReq.Command, mcpReq.Args))

    a.mcpMutex.Lock()
    defer a.mcpMutex.Unlock()

    // Check if process already exists
    if _, exists := a.mcpProcesses[mcpReq.ID]; exists {
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

    runtime.LogInfo(a.ctx, fmt.Sprintf("Executing command: %s with args: %v", cmdName, cmdArgs))
    cmd := exec.CommandContext(ctx, cmdName, cmdArgs...)

    // Set environment variables
    cmd.Env = os.Environ()
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
    a.mcpProcesses[mcpReq.ID] = process

    // Start monitoring goroutines
    go a.monitorMCPProcess(process)
    go a.forwardMCPStdout(process)
    go a.forwardMCPStderr(process)

    runtime.LogInfo(a.ctx, fmt.Sprintf("MCP server %s started with PID %d", mcpReq.ID, cmd.Process.Pid))
    return nil
}

// StopMCPServer stops an MCP server process
func (a *App) StopMCPServer(serverID string) error {
    runtime.LogInfo(a.ctx, fmt.Sprintf("Stopping MCP server: %s", serverID))

    a.mcpMutex.Lock()
    defer a.mcpMutex.Unlock()

    process, exists := a.mcpProcesses[serverID]
    if !exists {
        return fmt.Errorf("MCP server %s not found", serverID)
    }

    // Cancel the context to stop the process
    process.Cancel()

    // Close stdin to signal the process to terminate gracefully
    process.Stdin.Close()

    // Wait for the process to finish or force kill after timeout
    go func() {
        time.Sleep(5 * time.Second)
        if process.Cmd.Process != nil {
            runtime.LogWarning(a.ctx, fmt.Sprintf("Force killing MCP server %s", serverID))
            process.Cmd.Process.Kill()
        }
    }()

    // Wait for process to finish
    <-process.Done

    // Clean up
    delete(a.mcpProcesses, serverID)

    runtime.LogInfo(a.ctx, fmt.Sprintf("MCP server %s stopped", serverID))
    return nil
}

// StopAllMCPServers stops all running MCP server processes
func (a *App) StopAllMCPServers() error {
    runtime.LogInfo(a.ctx, "Stopping all MCP servers")

    a.mcpMutex.Lock()
    serverIDs := make([]string, 0, len(a.mcpProcesses))
    for serverID := range a.mcpProcesses {
        serverIDs = append(serverIDs, serverID)
    }
    a.mcpMutex.Unlock()

    var lastError error
    for _, serverID := range serverIDs {
        if err := a.StopMCPServer(serverID); err != nil {
            runtime.LogError(a.ctx, fmt.Sprintf("Failed to stop MCP server %s: %v", serverID, err))
            lastError = err
        }
    }

    runtime.LogInfo(a.ctx, fmt.Sprintf("Stopped %d MCP servers", len(serverIDs)))
    return lastError
}

// SendMCPMessage sends a JSON-RPC message to an MCP server
func (a *App) SendMCPMessage(serverID string, message MCPMessage) error {
    a.mcpMutex.RLock()
    process, exists := a.mcpProcesses[serverID]
    a.mcpMutex.RUnlock()

    if !exists {
        return fmt.Errorf("MCP server %s not found", serverID)
    }

    // Serialize message to JSON
    jsonData, err := json.Marshal(message)
    if err != nil {
        return fmt.Errorf("failed to marshal message: %v", err)
    }

    // Send message with newline
    _, err = process.Stdin.Write(append(jsonData, '\n'))
    if err != nil {
        return fmt.Errorf("failed to send message: %v", err)
    }

    runtime.LogDebug(a.ctx, fmt.Sprintf("Sent MCP message to %s: %s", serverID, string(jsonData)))
    return nil
}

// GetMCPServerStatus returns the status of all MCP servers
func (a *App) GetMCPServerStatus() map[string]string {
    a.mcpMutex.RLock()
    defer a.mcpMutex.RUnlock()

    status := make(map[string]string)
    for id, process := range a.mcpProcesses {
        if process.Cmd.Process != nil && process.Cmd.ProcessState == nil {
            status[id] = "running"
        } else {
            status[id] = "stopped"
        }
    }

    return status
}

// monitorMCPProcess monitors the process and handles completion
func (a *App) monitorMCPProcess(process *MCPProcess) {
    err := process.Cmd.Wait()
    process.Done <- err

    if err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("MCP server %s exited with error: %v", process.ID, err))
        runtime.EventsEmit(a.ctx, "mcp-server-error", map[string]interface{}{
            "serverId": process.ID,
            "error":    err.Error(),
        })
    } else {
        runtime.LogInfo(a.ctx, fmt.Sprintf("MCP server %s exited cleanly", process.ID))
    }

    runtime.EventsEmit(a.ctx, "mcp-server-stopped", map[string]interface{}{
        "serverId": process.ID,
    })
}

// forwardMCPStdout forwards stdout from MCP server to frontend
func (a *App) forwardMCPStdout(process *MCPProcess) {
    scanner := bufio.NewScanner(process.Stdout)
    for scanner.Scan() {
        line := scanner.Text()
        runtime.LogDebug(a.ctx, fmt.Sprintf("MCP %s stdout: %s", process.ID, line))

        // Try to parse as JSON-RPC message
        var message MCPMessage
        if err := json.Unmarshal([]byte(line), &message); err == nil {
            // Forward JSON-RPC message to frontend
            runtime.EventsEmit(a.ctx, "mcp-message", map[string]interface{}{
                "serverId": process.ID,
                "message":  message,
            })
        } else {
            // Forward raw output
            runtime.EventsEmit(a.ctx, "mcp-stdout", map[string]interface{}{
                "serverId": process.ID,
                "data":     line,
            })
        }
    }

    if err := scanner.Err(); err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("Error reading MCP %s stdout: %v", process.ID, err))
    }
}

// forwardMCPStderr forwards stderr from MCP server to frontend
func (a *App) forwardMCPStderr(process *MCPProcess) {
    scanner := bufio.NewScanner(process.Stderr)
    for scanner.Scan() {
        line := scanner.Text()
        runtime.LogDebug(a.ctx, fmt.Sprintf("MCP %s stderr: %s", process.ID, line))
        runtime.EventsEmit(a.ctx, "mcp-stderr", map[string]interface{}{
            "serverId": process.ID,
            "data":     line,
        })
    }
    if err := scanner.Err(); err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("Error reading MCP %s stderr: %v", process.ID, err))
    }
}

