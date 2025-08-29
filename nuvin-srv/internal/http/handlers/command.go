package handlers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/gin-gonic/gin"
)

// CommandRequest represents a command execution request
type CommandRequest struct {
	Command     string            `json:"command" binding:"required"`
	Args        []string          `json:"args,omitempty"`
	WorkingDir  string            `json:"workingDir,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Timeout     int               `json:"timeout,omitempty"` // timeout in seconds
	Description string            `json:"description,omitempty"`
}

// CommandResponse represents the response from command execution
type CommandResponse struct {
	Success   bool   `json:"success"`
	ExitCode  int    `json:"exitCode"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Error     string `json:"error,omitempty"`
	Duration  int64  `json:"duration"` // duration in milliseconds
	Truncated bool   `json:"truncated,omitempty"`
}

// ExecuteCommand handles command execution requests from browser
func ExecuteCommand(c *gin.Context) {
	var req CommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	startTime := time.Now()

	// Security check: Don't allow empty commands
	if req.Command == "" {
		c.JSON(http.StatusBadRequest, CommandResponse{
			Success:  false,
			ExitCode: -1,
			Error:    "Command cannot be empty",
			Duration: time.Since(startTime).Milliseconds(),
		})
		return
	}

	// Security check: Block dangerous commands
	dangerousCommands := []string{
		"chmod -R 777",
		"dd if=",
		"mkfs",
		"fdisk",
		"> /dev/",
		"shutdown",
		"reboot",
		"halt",
		"init 0",
		"init 6",
		"kill -9 -1",
		"killall -9",
		"rm -rf /",
		"format",
		"del /f /s /q C:",
	}

	for _, dangerous := range dangerousCommands {
		if contains(req.Command, dangerous) {
			c.JSON(http.StatusForbidden, CommandResponse{
				Success:  false,
				ExitCode: -1,
				Error:    "Command contains potentially dangerous operations and has been blocked for security reasons",
				Duration: time.Since(startTime).Milliseconds(),
			})
			return
		}
	}

	// Set default timeout to 5 minutes if not specified
	timeout := 300
	if req.Timeout > 0 {
		timeout = req.Timeout
	}
	if timeout > 600 { // Max 10 minutes
		timeout = 600
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Create command
	var cmd *exec.Cmd
	if len(req.Args) > 0 {
		cmd = exec.CommandContext(ctx, req.Command, req.Args...)
	} else {
		// For shell commands, use the default shell
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "sh"
		}
		cmd = exec.CommandContext(ctx, shell, "-c", req.Command)
	}

	// Set working directory if specified
	if req.WorkingDir != "" {
		cmd.Dir = req.WorkingDir
	}

	// Set environment variables
	if len(req.Env) > 0 {
		env := os.Environ()
		for key, value := range req.Env {
			env = append(env, fmt.Sprintf("%s=%s", key, value))
		}
		cmd.Env = env
	}

	// Execute command and capture output
	stdout, stderr, err := runCommandWithLimits(cmd)
	duration := time.Since(startTime).Milliseconds()

	// Determine exit code
	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = -1
		}
	}

	// Check for timeout
	if ctx.Err() == context.DeadlineExceeded {
		c.JSON(http.StatusRequestTimeout, CommandResponse{
			Success:  false,
			ExitCode: -1,
			Stdout:   stdout,
			Stderr:   stderr,
			Error:    fmt.Sprintf("Command timed out after %d seconds", timeout),
			Duration: duration,
		})
		return
	}

	// Return response
	response := CommandResponse{
		Success:  err == nil,
		ExitCode: exitCode,
		Stdout:   stdout,
		Stderr:   stderr,
		Duration: duration,
	}

	if err != nil && response.Error == "" {
		response.Error = err.Error()
	}

	c.JSON(http.StatusOK, response)
}

// runCommandWithLimits runs a command with output size limits
func runCommandWithLimits(cmd *exec.Cmd) (stdout, stderr string, err error) {
	const maxOutputSize = 30000 // 30KB limit

	stdoutBytes, err := cmd.Output()
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			stderr = string(exitError.Stderr)
		}
	}

	// Truncate stdout if too large
	if len(stdoutBytes) > maxOutputSize {
		stdout = string(stdoutBytes[:maxOutputSize]) + "\n... (output truncated)"
	} else {
		stdout = string(stdoutBytes)
	}

	// Truncate stderr if too large
	if len(stderr) > maxOutputSize {
		stderr = stderr[:maxOutputSize] + "\n... (output truncated)"
	}

	return stdout, stderr, err
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && 
		   (s == substr || 
		    (len(s) > len(substr) && 
		     string(s[0:len(substr)]) == substr))
}