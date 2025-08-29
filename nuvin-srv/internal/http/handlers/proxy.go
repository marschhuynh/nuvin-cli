package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// ProxyService handles route mapping for the proxy functionality
type ProxyService struct {
	routeMap map[string]string // Maps proxy routes to target servers
}

// NewProxyService creates a new proxy service with route mapping
func NewProxyService() *ProxyService {
	return &ProxyService{
		routeMap: map[string]string{
			"chat/completions": "https://api.githubcopilot.com",
			"models":           "https://api.githubcopilot.com",
		},
	}
}

// SetRouteMapping sets or updates a route mapping
func (p *ProxyService) SetRouteMapping(route, targetURL string) {
	p.routeMap[route] = targetURL
}

// GetRouteMapping gets the target URL for a route
func (p *ProxyService) GetRouteMapping(route string) (string, bool) {
	target, exists := p.routeMap[route]
	return target, exists
}

// ConfigureRoute handles POST /proxy/config to set route mappings
func (p *ProxyService) ConfigureRoute(c *gin.Context) {
	var config struct {
		Route     string `json:"route" binding:"required"`
		TargetURL string `json:"targetUrl" binding:"required"`
	}

	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid configuration"})
		return
	}

	p.SetRouteMapping(config.Route, config.TargetURL)
	c.JSON(http.StatusOK, gin.H{
		"message": "route configured successfully",
		"route":   config.Route,
		"target":  config.TargetURL,
	})
}

// ListRoutes handles GET /proxy/config to list current route mappings
func (p *ProxyService) ListRoutes(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"routes": p.routeMap})
}

// ProxyHandler handles requests to /proxy/* routes
func (p *ProxyService) ProxyHandler(c *gin.Context) {
	// Extract the route from the URL path
	// For /proxy/chat/completions -> route = "chat/completions"
	route := strings.TrimPrefix(c.Request.URL.Path, "/proxy/")

	if route == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no route specified"})
		return
	}

	// Get the target server URL from route mapping
	targetURL, exists := p.GetRouteMapping(route)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("no mapping found for route: %s", route),
		})
		return
	}

	// Construct the full target URL
	fullTargetURL := fmt.Sprintf("%s/%s", strings.TrimSuffix(targetURL, "/"), route)

	// Parse and validate the target URL
	parsedURL, err := url.Parse(fullTargetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid target URL"})
		return
	}

	// Add query parameters if any
	if c.Request.URL.RawQuery != "" {
		parsedURL.RawQuery = c.Request.URL.RawQuery
	}

	// Create the proxied request
	proxyReq, err := http.NewRequestWithContext(
		c.Request.Context(),
		c.Request.Method,
		parsedURL.String(),
		c.Request.Body,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create proxy request"})
		return
	}

	// Copy headers from original request (excluding hop-by-hop headers)
	for name, values := range c.Request.Header {
		// Skip hop-by-hop headers
		if isHopByHopHeader(name) {
			continue
		}
		for _, value := range values {
			proxyReq.Header.Add(name, value)
		}
	}

	// Set/Override host header to target server
	proxyReq.Header.Set("Host", parsedURL.Host)

	// Execute the proxied request
	client := &http.Client{
		// You can configure timeout here if needed
		// Timeout: 30 * time.Second,
	}

	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "proxy request failed"})
		return
	}
	defer resp.Body.Close()

	// Copy response headers (excluding hop-by-hop headers)
	for name, values := range resp.Header {
		if isHopByHopHeader(name) {
			continue
		}
		for _, value := range values {
			c.Header(name, value)
		}
	}

	// Set response status
	c.Status(resp.StatusCode)

	// Stream response body
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		// Log error but don't send another response as headers are already sent
		fmt.Printf("Error copying response body: %v\n", err)
	}
}

// isHopByHopHeader checks if a header is hop-by-hop (shouldn't be proxied)
func isHopByHopHeader(header string) bool {
	hopByHopHeaders := []string{
		"Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailers",
		"Transfer-Encoding",
		"Upgrade",
	}

	header = strings.ToLower(header)
	for _, hopHeader := range hopByHopHeaders {
		if strings.ToLower(hopHeader) == header {
			return true
		}
	}
	return false
}
