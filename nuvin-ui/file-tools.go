package main

import (
    "fmt"
    "os"
    "path/filepath"
    "time"

    "github.com/wailsapp/wails/v2/pkg/runtime"
)

// FileInfo represents basic file metadata for directory listings
type FileInfo struct {
    Path    string    `json:"path"`
    Name    string    `json:"name"`
    IsDir   bool      `json:"isDir"`
    Size    int64     `json:"size"`
    ModTime string    `json:"modTime"`
}

// FileWriteRequest represents a request to write file contents
type FileWriteRequest struct {
    Path    string `json:"path"`
    Content string `json:"content"`
}

// ReadFile reads a file from disk and returns its contents as UTF-8 string
func (a *App) ReadFile(path string) (string, error) {
    if path == "" {
        return "", fmt.Errorf("path is required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("ReadFile: %s", path))
    bytes, err := os.ReadFile(path)
    if err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("ReadFile error: %v", err))
        return "", err
    }
    return string(bytes), nil
}

// WriteFile writes content to the specified path, creating parent directories as needed
func (a *App) WriteFile(req FileWriteRequest) error {
    if req.Path == "" {
        return fmt.Errorf("path is required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("WriteFile: %s (%d bytes)", req.Path, len(req.Content)))
    if err := os.MkdirAll(filepath.Dir(req.Path), 0o755); err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("WriteFile mkdir error: %v", err))
        return err
    }
    if err := os.WriteFile(req.Path, []byte(req.Content), 0o644); err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("WriteFile error: %v", err))
        return err
    }
    return nil
}

// ListDir lists entries in a directory with basic metadata
func (a *App) ListDir(dir string) ([]FileInfo, error) {
    if dir == "" {
        return nil, fmt.Errorf("dir is required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("ListDir: %s", dir))
    entries, err := os.ReadDir(dir)
    if err != nil {
        runtime.LogError(a.ctx, fmt.Sprintf("ListDir error: %v", err))
        return nil, err
    }
    result := make([]FileInfo, 0, len(entries))
    for _, e := range entries {
        fi := FileInfo{
            Path:  filepath.Join(dir, e.Name()),
            Name:  e.Name(),
            IsDir: e.IsDir(),
        }
        if info, err := e.Info(); err == nil {
            fi.Size = info.Size()
            fi.ModTime = info.ModTime().Format(time.RFC3339)
        }
        result = append(result, fi)
    }
    return result, nil
}

// MkdirAll creates a directory and all parents as needed
func (a *App) MkdirAll(dir string) error {
    if dir == "" {
        return fmt.Errorf("dir is required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("MkdirAll: %s", dir))
    return os.MkdirAll(dir, 0o755)
}

// Remove removes a file or directory. If recursive is true, removes directories recursively.
func (a *App) Remove(path string, recursive bool) error {
    if path == "" {
        return fmt.Errorf("path is required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("Remove: %s (recursive=%v)", path, recursive))
    if recursive {
        return os.RemoveAll(path)
    }
    return os.Remove(path)
}

// Rename moves or renames a file or directory to a new path, creating parents as needed
func (a *App) Rename(oldPath, newPath string) error {
    if oldPath == "" || newPath == "" {
        return fmt.Errorf("oldPath and newPath are required")
    }
    runtime.LogInfo(a.ctx, fmt.Sprintf("Rename: %s -> %s", oldPath, newPath))
    if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
        return err
    }
    return os.Rename(oldPath, newPath)
}

// PathExists checks if a path exists on disk
func (a *App) PathExists(path string) (bool, error) {
    if path == "" {
        return false, fmt.Errorf("path is required")
    }
    _, err := os.Stat(path)
    if err == nil {
        return true, nil
    }
    if os.IsNotExist(err) {
        return false, nil
    }
    return false, err
}
