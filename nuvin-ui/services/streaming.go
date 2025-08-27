package services

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	runtime "nuvin-ui/internal/v3compat"
)

// StreamChunk represents a chunk of streamed data
type StreamChunk struct {
	StreamID string `json:"streamId"`
	Data     string `json:"data"`
	Done     bool   `json:"done"`
	Error    string `json:"error,omitempty"`
}

// StreamingService handles streaming response data via Wails events
type StreamingService struct {
	ctx context.Context
	mu  sync.Mutex // Protect concurrent stream operations
}

// NewStreamingService creates a new streaming service
func NewStreamingService() *StreamingService {
	return &StreamingService{}
}

// OnStartup initializes the streaming service
func (s *StreamingService) OnStartup(ctx context.Context) {
	s.ctx = ctx
}

// streamResponse handles streaming response data via Wails events
// Note: unexported to avoid Wails binding generation for io.ReadCloser param
func (s *StreamingService) streamResponse(streamID string, body io.ReadCloser) {
	defer body.Close()

	// Small delay to ensure frontend event listener is set up
	time.Sleep(100 * time.Millisecond)
	runtime.LogInfo(s.ctx, fmt.Sprintf("Stream [%s] starting to read data", streamID[:8]))

	reader := bufio.NewReader(body)
	buffer := make([]byte, 1024) // 1KB chunks

	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			// Create a proper copy of the data to avoid buffer reuse issues
			chunkData := make([]byte, n)
			copy(chunkData, buffer[:n])
			dataString := string(chunkData)
			
			runtime.LogInfo(s.ctx, fmt.Sprintf("Streaming chunk [%s] (%d bytes): %s", streamID[:8], n, dataString))
			
			// Use mutex to ensure sequential emission of events
			s.mu.Lock()
			payload := map[string]any{
				"streamId": streamID,
				"data":     dataString,
				"done":     false,
			}
			runtime.EventsEmit(s.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), payload)
			s.mu.Unlock()
			
			// Small delay between chunks to prevent frontend overwhelm
			time.Sleep(1 * time.Millisecond)
		}

		if err != nil {
			s.mu.Lock()
			if err == io.EOF {
				// Send completion signal
				payload := map[string]any{
					"streamId": streamID,
					"data":     "",
					"done":     true,
				}
				runtime.EventsEmit(s.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), payload)
				runtime.LogInfo(s.ctx, fmt.Sprintf("Stream [%s] completed successfully", streamID[:8]))
			} else {
				// Send error
				payload := map[string]any{
					"streamId": streamID,
					"data":     "",
					"done":     true,
					"error":    err.Error(),
				}
				runtime.EventsEmit(s.ctx, fmt.Sprintf("fetch-stream-chunk:%s", streamID), payload)
				runtime.LogError(s.ctx, fmt.Sprintf("Stream [%s] error: %v", streamID[:8], err))
			}
			s.mu.Unlock()
			break
		}
	}
}
