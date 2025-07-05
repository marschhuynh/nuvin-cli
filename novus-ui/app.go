package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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
	const CLIENT_ID = "Iv23liAiMVpE28SJwyIn" // GitHub Copilot client id

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
		tokenReq.Header.Set("Accept", "application/json")

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
		if err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to create Copilot request: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		copilotReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
		copilotReq.Header.Set("Accept", "application/json")
		copilotReq.Header.Set("User-Agent", "Nuvin-Space/1.0")

		copilotResp, err := client.Do(copilotReq)
		if err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to get Copilot token: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}
		defer copilotResp.Body.Close()

		if copilotResp.StatusCode != http.StatusOK {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Copilot token request failed: %d", copilotResp.StatusCode))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		var copilotData CopilotTokenResponse
		if err := json.NewDecoder(copilotResp.Body).Decode(&copilotData); err != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Failed to decode Copilot response: %v", err))
			return a.handleCopilotFallback(tokenData.AccessToken)
		}

		runtime.LogInfo(a.ctx, "Successfully obtained Copilot token")
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
