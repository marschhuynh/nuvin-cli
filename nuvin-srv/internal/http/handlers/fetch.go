package handlers

import (
	"io"
	"net/http"
	"strings"

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

// FetchProxy proxies HTTP requests on behalf of the client.
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

	httpReq, err := http.NewRequest(method, req.URL, bodyReader)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusOK, FetchResponse{Ok: false, Error: err.Error()})
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusOK, FetchResponse{Ok: false, Error: err.Error()})
		return
	}

	headers := make(map[string]string, len(resp.Header))
	for k, v := range resp.Header {
		headers[k] = strings.Join(v, ",")
	}

	c.JSON(http.StatusOK, FetchResponse{
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    headers,
		Body:       string(bodyBytes),
		Ok:         resp.StatusCode >= 200 && resp.StatusCode < 300,
	})
}
