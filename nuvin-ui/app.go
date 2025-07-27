package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx          context.Context
	mcpProcesses map[string]*MCPProcess
	mcpMutex     sync.RWMutex
}

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

// FetchRequest represents a fetch request from JavaScript
type FetchRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body,omitempty"`
	Stream  bool              `json:"stream,omitempty"`
}

// FetchResponse represents the response to send back to JavaScript
type FetchResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	OK         bool              `json:"ok"`
	Error      string            `json:"error,omitempty"`
	StreamID   string            `json:"streamId,omitempty"`
}

// StreamChunk represents a chunk of streamed data
type StreamChunk struct {
	StreamID string `json:"streamId"`
	Data     string `json:"data"`
	Done     bool   `json:"done"`
	Error    string `json:"error,omitempty"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		mcpProcesses: make(map[string]*MCPProcess),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.listenForGlobalShortcut()
	a.CheckForUpdates()
}

// FetchProxy handles HTTP requests from JavaScript, bypassing CORS and browser restrictions
func (a *App) FetchProxy(fetchReq FetchRequest) FetchResponse {
	runtime.LogInfo(a.ctx, fmt.Sprintf("FetchProxy: %s %s %v", fetchReq.Method, fetchReq.URL, fetchReq.Stream))

	// Default method to GET if not specified
	if fetchReq.Method == "" {
		fetchReq.Method = "GET"
	}

	// Create HTTP client with appropriate timeout
	timeout := 30 * time.Second

	// Check if this might be a streaming request (SSE, etc.)
	acceptHeader := fetchReq.Headers["accept"]
	hasStreamInBody := strings.Contains(fetchReq.Body, `"stream":true`) || strings.Contains(fetchReq.Body, `"stream": true`)
	isStreamingRequest := fetchReq.Stream ||
		acceptHeader == "text/event-stream" ||
		strings.Contains(strings.ToLower(acceptHeader), "event-stream") ||
		hasStreamInBody

	runtime.LogInfo(a.ctx, fmt.Sprintf("Accept header: %s, Stream flag: %v, Has stream in body: %v, Is streaming: %v", acceptHeader, fetchReq.Stream, hasStreamInBody, isStreamingRequest))

	if isStreamingRequest {
		timeout = 0 // No timeout for streaming requests
		runtime.LogInfo(a.ctx, "Using no timeout for streaming request")
	}

	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DisableKeepAlives:     true,
			ResponseHeaderTimeout: 30 * time.Second,
			IdleConnTimeout:       90 * time.Second,
			ForceAttemptHTTP2:     false, // Force HTTP/1.1 to avoid HTTP/2 stream issues
		},
	}

	// Prepare request body
	var bodyReader io.Reader
	if fetchReq.Body != "" {
		bodyReader = strings.NewReader(fetchReq.Body)
	}

	// Create HTTP request
	req, err := http.NewRequest(fetchReq.Method, fetchReq.URL, bodyReader)
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to create request: %v", err))
		return FetchResponse{
			Status:     0,
			StatusText: "Request Creation Failed",
			OK:         false,
			Error:      err.Error(),
			Headers:    make(map[string]string),
		}
	}

	// Set headers
	for key, value := range fetchReq.Headers {
		req.Header.Set(key, value)
	}

	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Request failed: %v", err))
		return FetchResponse{
			Status:     0,
			StatusText: "Network Error",
			OK:         false,
			Error:      err.Error(),
			Headers:    make(map[string]string),
		}
	}
	// Note: Don't defer resp.Body.Close() here - we'll handle it based on streaming vs non-streaming

	// Convert response headers to map
	headers := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			headers[key] = values[0] // Take first value for simplicity
		}
	}

	runtime.LogInfo(a.ctx, fmt.Sprintf("Response: %d %s", resp.StatusCode, resp.Status))

	// Check if streaming is requested (explicit flag or stream in body)
	if fetchReq.Stream || hasStreamInBody {
		// Generate unique stream ID
		streamID := uuid.New().String()
		streamType := "explicit"
		if hasStreamInBody && !fetchReq.Stream {
			streamType = "auto-detected"
		}
		runtime.LogInfo(a.ctx, fmt.Sprintf("Starting %s stream [%s] for %s", streamType, streamID[:8], fetchReq.URL))

		// Start streaming in a goroutine
		go a.streamResponse(streamID, resp.Body)

		return FetchResponse{
			Status:     resp.StatusCode,
			StatusText: resp.Status,
			Headers:    headers,
			OK:         resp.StatusCode >= 200 && resp.StatusCode < 300,
			StreamID:   streamID,
		}
	}

	// Read response body for non-streaming requests
	defer resp.Body.Close() // Close body for non-streaming requests
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to read response body: %v", err))
		return FetchResponse{
			Status:     resp.StatusCode,
			StatusText: resp.Status,
			OK:         resp.StatusCode >= 200 && resp.StatusCode < 300,
			Error:      err.Error(),
			Headers:    make(map[string]string),
		}
	}

	return FetchResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    headers,
		Body:       string(bodyBytes),
		OK:         resp.StatusCode >= 200 && resp.StatusCode < 300,
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// GitHub OAuth device flow response structures
type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	Interval        int    `json:"interval"`
}

type AccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	Error       string `json:"error"`
}

type CopilotTokenResponse struct {
	Token string `json:"token"`
}

// FetchGithubCopilotKey handles GitHub authentication and returns access token
func (a *App) FetchGithubCopilotKey() string {
	// const CLIENT_ID = "Iv23liAiMVpE28SJwyIn" // GitHub Copilot client id
	const CLIENT_ID = "Iv1.b507a08c87ecfe98" // GitHub Copilot client id

	// Step 1: Request device code with proper headers
	deviceBody := url.Values{
		"client_id": {CLIENT_ID},
		"scope":     {"read:user"},
	}

	deviceReq, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(deviceBody.Encode()))
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to create device code request: %v", err))
		return ""
	}

	deviceReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	deviceReq.Header.Set("Accept", "application/json")
	deviceReq.Header.Set("Editor-Version", "vscode/1.100.3")
	deviceReq.Header.Set("Editor-Plugin-Version", "GitHub.copilot/1.330.0")
	deviceReq.Header.Set("User-Agent", "GithubCopilot/1.330.0")

	client := &http.Client{}
	deviceResp, err := client.Do(deviceReq)
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to request device code: %v", err))
		return ""
	}
	defer deviceResp.Body.Close()

	if deviceResp.StatusCode != http.StatusOK {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to request device code: %d", deviceResp.StatusCode))
		return ""
	}

	var deviceData DeviceCodeResponse
	if err := json.NewDecoder(deviceResp.Body).Decode(&deviceData); err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to decode device code response: %v", err))
		return ""
	}

	// Step 2: Ask user to authenticate
	browser.OpenURL(deviceData.VerificationURI)

	// Automatically copy the user code to clipboard
	err = runtime.ClipboardSetText(a.ctx, deviceData.UserCode)
	if err != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to copy user code to clipboard: %v", err))
	} else {
		runtime.LogInfo(a.ctx, fmt.Sprintf("User code %s copied to clipboard", deviceData.UserCode))
	}

	_, err = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   "GitHub Authentication",
		Message: fmt.Sprintf("Please authenticate with GitHub using code: %s\n\nThe code has been automatically copied to your clipboard. Just paste it on the GitHub authentication page.\n\nClick OK after you've completed authentication.", deviceData.UserCode),
	})
	if err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Failed to show dialog: %v", err))
		return ""
	}

	// Step 3: Poll for access token with proper headers
	for {
		time.Sleep(time.Duration(deviceData.Interval) * time.Second)

		tokenBody := url.Values{
			"client_id":   {CLIENT_ID},
			"device_code": {deviceData.DeviceCode},
			"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		}

		tokenReq, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(tokenBody.Encode()))
		if err != nil {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to create token request: %v", err))
			return ""
		}

		tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		tokenReq.Header.Set("accept", "application/json")
		tokenReq.Header.Set("editor-version", "vscode/1.100.3")
		tokenReq.Header.Set("editor-plugin-version", "GitHub.copilot/1.330.0")
		tokenReq.Header.Set("user-agent", "GithubCopilot/1.330.0")

		tokenResp, err := client.Do(tokenReq)
		if err != nil {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to poll for access token: %v", err))
			return ""
		}
		defer tokenResp.Body.Close()

		if tokenResp.StatusCode != http.StatusOK {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to poll for access token: %d", tokenResp.StatusCode))
			return ""
		}

		var tokenData AccessTokenResponse
		if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to decode token response: %v", err))
			return ""
		}

		if tokenData.Error != "" {
			if tokenData.Error == "authorization_pending" {
				continue
			}
			runtime.LogError(a.ctx, fmt.Sprintf("GitHub auth error: %s", tokenData.Error))
			return ""
		}

		runtime.LogInfo(a.ctx, "Successfully obtained GitHub access token")

		// Step 4: Verify the token works by testing API access
		userReq, err := http.NewRequest("GET", "https://api.github.com/user", nil)
		if err != nil {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to create user request: %v", err))
			return ""
		}
		userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
		userReq.Header.Set("Accept", "application/json")

		userResp, err := client.Do(userReq)
		if err != nil {
			runtime.LogError(a.ctx, fmt.Sprintf("Failed to verify token: %v", err))
			return ""
		}
		defer userResp.Body.Close()

		if userResp.StatusCode != http.StatusOK {
			runtime.LogError(a.ctx, fmt.Sprintf("Token verification failed: %d", userResp.StatusCode))
			return ""
		}

		// Step 5: Try to get Copilot token (this may fail, but we'll handle it gracefully)
		runtime.LogInfo(a.ctx, "Attempting to get Copilot token...")

		copilotReq, err := http.NewRequest("GET", "https://api.github.com/copilot_internal/v2/token", nil)
		runtime.LogInfo(a.ctx, fmt.Sprintf("Copilot request: %v", copilotReq))

		if err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to create Copilot request: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		copilotReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
		copilotReq.Header.Set("user-agent", "GithubCopilot/1.330.0")

		copilotResp, err := client.Do(copilotReq)
		if err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to get Copilot token: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}
		defer copilotResp.Body.Close()

		if copilotResp.StatusCode != http.StatusOK {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Copilot token request failed: %d - %s - %v", copilotResp.StatusCode, tokenData.AccessToken, copilotResp))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		var copilotData CopilotTokenResponse
		if err := json.NewDecoder(copilotResp.Body).Decode(&copilotData); err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to decode Copilot response: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		return copilotData.Token
	}
}

// handleCopilotFallback handles the case where Copilot token is not available
func (a *App) handleCopilotFallback(accessToken string) string {
	runtime.LogInfo(a.ctx, "Using GitHub access token instead of Copilot token")

	_, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   "GitHub Access Token",
		Message: "Successfully authenticated with GitHub!\n\nNote: The Copilot internal API is not available for public use. You'll receive a GitHub access token instead, which you can use for GitHub API calls.\n\nFor actual Copilot functionality, consider using GitHub Copilot in VS Code, GitHub.com, or the GitHub CLI.",
	})
	if err != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to show fallback dialog: %v", err))
	}

	return accessToken
}

// streamResponse handles streaming response data via Wails events
func (a *App) streamResponse(streamID string, body io.ReadCloser) {
	defer body.Close()

	// Small delay to ensure frontend event listener is set up
	time.Sleep(100 * time.Millisecond)
	runtime.LogInfo(a.ctx, fmt.Sprintf("Stream [%s] starting to read data", streamID[:8]))

	reader := bufio.NewReader(body)
	buffer := make([]byte, 1024) // 1KB chunks

	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			// Send chunk via event
			chunkData := string(buffer[:n])
			chunk := StreamChunk{
				StreamID: streamID,
				Data:     chunkData,
				Done:     false,
			}
			runtime.LogInfo(a.ctx, fmt.Sprintf("Streaming chunk [%s] (%d bytes): %s", streamID[:8], n, chunkData))
			runtime.EventsEmit(a.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), chunk)
		}

		if err != nil {
			if err == io.EOF {
				// Send completion signal
				chunk := StreamChunk{
					StreamID: streamID,
					Data:     "",
					Done:     true,
				}
				runtime.EventsEmit(a.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), chunk)
			} else {
				// Send error
				chunk := StreamChunk{
					StreamID: streamID,
					Data:     "",
					Done:     true,
					Error:    err.Error(),
				}
				runtime.EventsEmit(a.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), chunk)
			}
			break
		}
	}
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
		runtime.LogWarning(a.ctx, fmt.Sprintf("MCP %s stderr: %s", process.ID, line))

		runtime.EventsEmit(a.ctx, "mcp-stderr", map[string]interface{}{
			"serverId": process.ID,
			"data":     line,
		})
	}

	if err := scanner.Err(); err != nil {
		runtime.LogError(a.ctx, fmt.Sprintf("Error reading MCP %s stderr: %v", process.ID, err))
	}
}

// CommandRequest represents a command execution request
type CommandRequest struct {
	Command     string            `json:"command"`
	Args        []string          `json:"args,omitempty"`
	WorkingDir  string            `json:"workingDir,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Timeout     int               `json:"timeout,omitempty"` // timeout in seconds
	Description string            `json:"description,omitempty"`
}

// CommandResponse represents the response from command execution
type CommandResponse struct {
	Success    bool   `json:"success"`
	ExitCode   int    `json:"exitCode"`
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	Error      string `json:"error,omitempty"`
	Duration   int64  `json:"duration"` // duration in milliseconds
	Truncated  bool   `json:"truncated,omitempty"`
}

// ExecuteCommand executes a shell command and returns the result
func (a *App) ExecuteCommand(cmdReq CommandRequest) CommandResponse {
	startTime := time.Now()

	// Security check: Don't allow empty commands
	if cmdReq.Command == "" {
		return CommandResponse{
			Success:  false,
			ExitCode: -1,
			Error:    "Command cannot be empty",
			Duration: time.Since(startTime).Milliseconds(),
		}
	}

	// Set default timeout to 2 minutes if not specified
	timeout := 120
	if cmdReq.Timeout > 0 {
		timeout = cmdReq.Timeout
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Create command
	var cmd *exec.Cmd
	if len(cmdReq.Args) > 0 {
		cmd = exec.CommandContext(ctx, cmdReq.Command, cmdReq.Args...)
	} else {
		// For shell commands, use sh -c to execute
		cmd = exec.CommandContext(ctx, "sh", "-c", cmdReq.Command)
	}

	// Set working directory if specified
	if cmdReq.WorkingDir != "" {
		cmd.Dir = cmdReq.WorkingDir
	}

	// Set environment variables
	if len(cmdReq.Env) > 0 {
		env := os.Environ()
		for key, value := range cmdReq.Env {
			env = append(env, fmt.Sprintf("%s=%s", key, value))
		}
		cmd.Env = env
	}

	// Log command execution
	runtime.LogInfo(a.ctx, fmt.Sprintf("Executing command: %s %v (timeout: %ds)", cmdReq.Command, cmdReq.Args, timeout))

	// Execute command and capture output
	stdout, stderr, err := a.runCommandWithLimits(cmd)
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
		return CommandResponse{
			Success:  false,
			ExitCode: -1,
			Stdout:   stdout,
			Stderr:   stderr,
			Error:    fmt.Sprintf("Command timed out after %d seconds", timeout),
			Duration: duration,
		}
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

	return response
}

// runCommandWithLimits runs a command with output size limits
func (a *App) runCommandWithLimits(cmd *exec.Cmd) (stdout, stderr string, err error) {
	const maxOutputSize = 30000 // 30KB limit to match Claude Code's limit

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", err
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return "", "", err
	}

	err = cmd.Start()
	if err != nil {
		return "", "", err
	}

	// Read stdout with limit
	stdoutBytes := make([]byte, maxOutputSize)
	stdoutRead, _ := io.ReadFull(stdoutPipe, stdoutBytes)
	if stdoutRead == maxOutputSize {
		// Check if there's more data
		extraBytes := make([]byte, 1)
		if n, _ := stdoutPipe.Read(extraBytes); n > 0 {
			stdout = string(stdoutBytes) + "\n... (output truncated)"
		} else {
			stdout = string(stdoutBytes[:stdoutRead])
		}
	} else {
		stdout = string(stdoutBytes[:stdoutRead])
	}

	// Read stderr with limit
	stderrBytes := make([]byte, maxOutputSize)
	stderrRead, _ := io.ReadFull(stderrPipe, stderrBytes)
	if stderrRead == maxOutputSize {
		// Check if there's more data
		extraBytes := make([]byte, 1)
		if n, _ := stderrPipe.Read(extraBytes); n > 0 {
			stderr = string(stderrBytes) + "\n... (output truncated)"
		} else {
			stderr = string(stderrBytes[:stderrRead])
		}
	} else {
		stderr = string(stderrBytes[:stderrRead])
	}

	err = cmd.Wait()
	return stdout, stderr, err
}
