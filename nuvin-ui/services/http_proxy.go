package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	runtime "nuvin-ui/internal/v3compat"

	"github.com/google/uuid"
)

// FetchRequest represents a fetch request from JavaScript
type FetchRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body,omitempty"`
	Stream  bool              `json:"stream,omitempty"`
	Timeout int               `json:"timeout,omitempty"` // timeout in seconds (0 means default)
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

// HTTPProxyService handles HTTP requests from JavaScript, bypassing CORS and browser restrictions
type HTTPProxyService struct {
	ctx              context.Context
	streamingService *StreamingService
}

// NewHTTPProxyService creates a new HTTP proxy service
func NewHTTPProxyService(streamingService *StreamingService) *HTTPProxyService {
	return &HTTPProxyService{
		streamingService: streamingService,
	}
}

// OnStartup initializes the HTTP proxy service
func (s *HTTPProxyService) OnStartup(ctx context.Context) {
	s.ctx = ctx
}

// FetchProxy handles HTTP requests from JavaScript, bypassing CORS and browser restrictions
func (s *HTTPProxyService) FetchProxy(fetchReq FetchRequest) FetchResponse {
	runtime.LogInfo(s.ctx, fmt.Sprintf("FetchProxy: %s %s %v", fetchReq.Method, fetchReq.URL, fetchReq.Stream))

	// Default method to GET if not specified
	if fetchReq.Method == "" {
		fetchReq.Method = "GET"
	}

	// Create HTTP client with appropriate timeout
	// Default to 5 minutes unless specified, streaming disables client timeout
	timeoutSeconds := 300
	if fetchReq.Timeout > 0 {
		timeoutSeconds = fetchReq.Timeout
	}
	timeout := time.Duration(timeoutSeconds) * time.Second

	// Check if this might be a streaming request (SSE, etc.)
	acceptHeader := fetchReq.Headers["accept"]
	hasStreamInBody := strings.Contains(fetchReq.Body, `"stream":true`) || strings.Contains(fetchReq.Body, `"stream": true`)
	isStreamingRequest := fetchReq.Stream ||
		acceptHeader == "text/event-stream" ||
		strings.Contains(strings.ToLower(acceptHeader), "event-stream") ||
		hasStreamInBody

	runtime.LogInfo(s.ctx, fmt.Sprintf("Accept header: %s, Stream flag: %v, Has stream in body: %v, Is streaming: %v", acceptHeader, fetchReq.Stream, hasStreamInBody, isStreamingRequest))

	if isStreamingRequest {
		timeout = 0 // No overall timeout for streaming requests
		runtime.LogInfo(s.ctx, "Using no timeout for streaming request")
	}

	// Configure transport with header timeout matching request timeout (cap at 60s for streaming)
	headerTimeout := time.Duration(timeoutSeconds) * time.Second
	if isStreamingRequest {
		headerTimeout = 60 * time.Second
	}

	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DisableKeepAlives:     true,
			ResponseHeaderTimeout: headerTimeout,
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
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to create request: %v", err))
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
		runtime.LogError(s.ctx, fmt.Sprintf("Request failed: %v", err))
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

	runtime.LogInfo(s.ctx, fmt.Sprintf("Response: %d %s", resp.StatusCode, resp.Status))

	// Check if streaming is requested (explicit flag or stream in body)
	if fetchReq.Stream || hasStreamInBody {
		// Generate unique stream ID
		streamID := uuid.New().String()
		streamType := "explicit"
		if hasStreamInBody && !fetchReq.Stream {
			streamType = "auto-detected"
		}
		runtime.LogInfo(s.ctx, fmt.Sprintf("Starting %s stream [%s] for %s", streamType, streamID[:8], fetchReq.URL))

		// Start streaming in a goroutine
		go s.streamingService.StreamResponse(streamID, resp.Body)

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
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to read response body: %v", err))
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
