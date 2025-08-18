package main

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// FetchRequest represents an HTTP request to proxy
// compatible with the Wails FetchProxy structure
// to allow reusing the same client code in browser mode.
type FetchRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body,omitempty"`
}

// FetchResponse mirrors the response returned to the client
// from the proxied request.
type FetchResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	OK         bool              `json:"ok"`
	Error      string            `json:"error,omitempty"`
}

// fetchHandler proxies arbitrary HTTP requests so the
// browser client can communicate with external services
// through this server.
func fetchHandler(c *gin.Context) {
	var req FetchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, FetchResponse{Error: err.Error()})
		return
	}

	if req.Method == "" {
		req.Method = http.MethodGet
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, FetchResponse{Error: err.Error()})
		return
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, FetchResponse{Error: err.Error()})
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, FetchResponse{Error: err.Error()})
		return
	}

	headers := make(map[string]string)
	for k, vals := range resp.Header {
		if len(vals) > 0 {
			headers[k] = vals[0]
		}
	}

	c.JSON(http.StatusOK, FetchResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    headers,
		Body:       string(data),
		OK:         resp.StatusCode >= 200 && resp.StatusCode < 300,
	})
}

func main() {
	r := gin.Default()
	r.POST("/fetch", fetchHandler)
	r.GET("/health", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	r.Run(":8080")
}
