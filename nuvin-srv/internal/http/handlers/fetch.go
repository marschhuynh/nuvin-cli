package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// FetchRequest describes a proxied fetch request.
type FetchRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Stream  bool              `json:"stream"`
}

// FetchResponse is the response returned to the frontend.
type FetchResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Ok         bool              `json:"ok"`
	Error      string            `json:"error,omitempty"`
}

// FetchProxy proxies HTTP requests on behalf of the client with streaming support.
func FetchProxy(c *gin.Context) {
	var req FetchRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.URL == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	// Create request with context for cancellation
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, bodyReader)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Copy headers from the original request
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	// Use a client with a reasonable timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusOK, FetchResponse{Ok: false, Error: err.Error()})
		return
	}
	defer resp.Body.Close()

	// Check if this is a streaming response (Server-Sent Events)
	contentType := resp.Header.Get("Content-Type")
	isStreaming := req.Stream && strings.Contains(contentType, "text/event-stream")

	if isStreaming {
		handleStreamingResponse(c, resp)
		return
	}

	handleRegularResponse(c, resp)
}

// handleStreamingResponse handles Server-Sent Events streaming
func handleStreamingResponse(c *gin.Context, resp *http.Response) {
	// Copy all response headers from the upstream server, but skip CORS-related ones
	for k, v := range resp.Header {
		// Skip CORS headers that might conflict with our own
		lower := strings.ToLower(k)
		if lower == "access-control-allow-origin" ||
			lower == "access-control-allow-headers" ||
			lower == "access-control-expose-headers" {
			continue
		}
		for _, val := range v {
			c.Header(k, val)
		}
	}

	// Set additional streaming headers if not already present
	if c.GetHeader("Cache-Control") == "" {
		c.Header("Cache-Control", "no-cache")
	}
	if c.GetHeader("Connection") == "" {
		c.Header("Connection", "keep-alive")
	}

	// Set CORS headers for browser compatibility - these must come after copying headers
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "*")
	c.Header("Access-Control-Expose-Headers", "*")

	// Copy response status
	c.Status(resp.StatusCode)

	// Get the response writer
	w := c.Writer
	flusher, ok := w.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	// Stream the response body directly without buffering
	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			// Write the chunk directly to the response
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				break
			}
			flusher.Flush()
		}

		if err != nil {
			if err != io.EOF {
				// Log error but don't send to client as stream may be closed
				fmt.Printf("Stream error: %v\n", err)
			}
			break
		}

		// Check if client disconnected
		if c.Request.Context().Err() != nil {
			break
		}
	}
}

// handleRegularResponse handles non-streaming responses by relaying them transparently
func handleRegularResponse(c *gin.Context, resp *http.Response) {
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusOK, FetchResponse{Ok: false, Error: err.Error()})
		return
	}

	// Copy all response headers from the upstream server, but skip CORS-related ones
	for k, v := range resp.Header {
		// Skip CORS headers that might conflict with our own
		lower := strings.ToLower(k)
		if lower == "access-control-allow-origin" ||
			lower == "access-control-allow-headers" ||
			lower == "access-control-expose-headers" {
			continue
		}
		for _, val := range v {
			c.Header(k, val)
		}
	}

	// Set CORS headers for browser compatibility - these must come after copying headers
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "*")
	c.Header("Access-Control-Expose-Headers", "*")

	// Return the raw response with original status code and body (transparent proxy)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), bodyBytes)
}
