package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	runtime "nuvin-ui/internal/v3compat"

	"github.com/pkg/browser"
)

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

type GitHubTokenResponse struct {
	AccessToken string `json:"accessToken"`
	ApiKey      string `json:"apiKey"`
}

// GitHubOAuthService handles GitHub authentication and returns access token
type GitHubOAuthService struct {
	ctx context.Context
}

// NewGitHubOAuthService creates a new GitHub OAuth service
func NewGitHubOAuthService() *GitHubOAuthService {
	return &GitHubOAuthService{}
}

// OnStartup initializes the GitHub OAuth service
func (s *GitHubOAuthService) OnStartup(ctx context.Context) {
	s.ctx = ctx
}

// GetCopilotToken handles GitHub authentication and returns access token and API key
func (s *GitHubOAuthService) GetCopilotToken(accessToken string) GitHubTokenResponse {
	// Step 5: Try to get Copilot token (this may fail, but we'll handle it gracefully)
	runtime.LogInfo(s.ctx, "Attempting to get Copilot token...")
	client := &http.Client{}
	copilotReq, err := http.NewRequest("GET", "https://api.github.com/copilot_internal/v2/token", nil)
	runtime.LogInfo(s.ctx, fmt.Sprintf("Copilot request: %v", copilotReq))

	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Failed to create Copilot request: %v", err))
		return s.handleCopilotFallback(accessToken)
	}

	copilotReq.Header.Set("Authorization", "Bearer "+accessToken)
	copilotReq.Header.Set("user-agent", "GithubCopilot/1.330.0")

	copilotResp, err := client.Do(copilotReq)
	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Failed to get Copilot token: %v", err))
		return s.handleCopilotFallback(accessToken)
	}
	defer copilotResp.Body.Close()

	if copilotResp.StatusCode != http.StatusOK {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Copilot token request failed: %d - %s - %v", copilotResp.StatusCode, accessToken, copilotResp))
		return s.handleCopilotFallback(accessToken)
	}

	var copilotData CopilotTokenResponse
	if err := json.NewDecoder(copilotResp.Body).Decode(&copilotData); err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Failed to decode Copilot response: %v", err))
		return s.handleCopilotFallback(accessToken)
	}

	return GitHubTokenResponse{
		AccessToken: accessToken,
		ApiKey:      copilotData.Token,
	}
}

// FetchGithubCopilotKey handles GitHub authentication and returns access token and API key
func (s *GitHubOAuthService) FetchGithubCopilotKey() GitHubTokenResponse {
	const CLIENT_ID = "Iv1.b507a08c87ecfe98" // GitHub Copilot client id

	// Step 1: Request device code with proper headers
	deviceBody := url.Values{
		"client_id": {CLIENT_ID},
		"scope":     {"read:user"},
	}

	deviceReq, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(deviceBody.Encode()))
	if err != nil {
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to create device code request: %v", err))
		return GitHubTokenResponse{}
	}

	deviceReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	deviceReq.Header.Set("Accept", "application/json")
	deviceReq.Header.Set("Editor-Version", "vscode/1.100.3")
	deviceReq.Header.Set("Editor-Plugin-Version", "GitHub.copilot/1.330.0")
	deviceReq.Header.Set("User-Agent", "GithubCopilot/1.330.0")

	client := &http.Client{}
	deviceResp, err := client.Do(deviceReq)
	if err != nil {
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to request device code: %v", err))
		return GitHubTokenResponse{}
	}
	defer deviceResp.Body.Close()

	if deviceResp.StatusCode != http.StatusOK {
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to request device code: %d", deviceResp.StatusCode))
		return GitHubTokenResponse{}
	}

	var deviceData DeviceCodeResponse
	if err := json.NewDecoder(deviceResp.Body).Decode(&deviceData); err != nil {
		runtime.LogError(s.ctx, fmt.Sprintf("Failed to decode device code response: %v", err))
		return GitHubTokenResponse{}
	}

	// Step 2: Ask user to authenticate
	browser.OpenURL(deviceData.VerificationURI)

	// Automatically copy the user code to clipboard
	err = runtime.ClipboardSetText(s.ctx, deviceData.UserCode)
	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Failed to copy user code to clipboard: %v", err))
	} else {
		runtime.LogInfo(s.ctx, fmt.Sprintf("User code %s copied to clipboard", deviceData.UserCode))
	}

	// Step 3: Poll for access token with proper headers
	for {
		time.Sleep(time.Duration(deviceData.Interval) * time.Second)

		tokenBody := url.Values{
			"client_id":   {CLIENT_ID},
			"device_code": {deviceData.DeviceCode},
			"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		}

		runtime.LogInfo(s.ctx, fmt.Sprintf("Polling for access token with body: %s", tokenBody.Encode()))

		tokenReq, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(tokenBody.Encode()))
		if err != nil {
			runtime.LogError(s.ctx, fmt.Sprintf("Failed to create token request: %v", err))
			return GitHubTokenResponse{}
		}

		tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		tokenReq.Header.Set("accept", "application/json")
		tokenReq.Header.Set("editor-version", "vscode/1.100.3")
		tokenReq.Header.Set("editor-plugin-version", "GitHub.copilot/1.330.0")
		tokenReq.Header.Set("user-agent", "GithubCopilot/1.330.0")

		tokenResp, err := client.Do(tokenReq)
		if err != nil {
			runtime.LogError(s.ctx, fmt.Sprintf("Failed to poll for access token: %v", err))
			return GitHubTokenResponse{}
		}
		defer tokenResp.Body.Close()

		var tokenData AccessTokenResponse
		if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
			runtime.LogError(s.ctx, fmt.Sprintf("Failed to decode token response: %v", err))
			return GitHubTokenResponse{}
		}

		runtime.LogInfo(s.ctx, fmt.Sprintf("Token response: status=%d, error=%s, hasToken=%t", tokenResp.StatusCode, tokenData.Error, tokenData.AccessToken != ""))
		runtime.LogInfo(s.ctx, fmt.Sprintf("Access token response: status=%s", tokenData.AccessToken))

		if tokenData.Error != "" {
			if tokenData.Error == "authorization_pending" {
				runtime.LogInfo(s.ctx, "Authorization still pending, continuing to poll...")
				continue
			}
			if tokenData.Error == "slow_down" {
				runtime.LogInfo(s.ctx, "Rate limited, slowing down polling...")
				time.Sleep(5 * time.Second) // Add extra delay for rate limiting
				continue
			}
			runtime.LogError(s.ctx, fmt.Sprintf("GitHub auth error: %s", tokenData.Error))
			return GitHubTokenResponse{}
		}

		// Success case - we have a token
		if tokenData.AccessToken != "" {
			runtime.LogInfo(s.ctx, "Successfully obtained GitHub access token")

			// Step 4: Verify the token works by testing API access
			userReq, err := http.NewRequest("GET", "https://api.github.com/user", nil)
			if err != nil {
				runtime.LogError(s.ctx, fmt.Sprintf("Failed to create user request: %v", err))
				return GitHubTokenResponse{}
			}
			userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
			userReq.Header.Set("Accept", "application/json")

			userResp, err := client.Do(userReq)
			if err != nil {
				runtime.LogError(s.ctx, fmt.Sprintf("Failed to verify token: %v", err))
				return GitHubTokenResponse{}
			}
			defer userResp.Body.Close()

			if userResp.StatusCode != http.StatusOK {
				runtime.LogError(s.ctx, fmt.Sprintf("Token verification failed: %d", userResp.StatusCode))
				return GitHubTokenResponse{}
			}

			return s.GetCopilotToken(tokenData.AccessToken)
		}
	}
}

// handleCopilotFallback handles the case where Copilot token is not available
func (s *GitHubOAuthService) handleCopilotFallback(accessToken string) GitHubTokenResponse {
	runtime.LogInfo(s.ctx, "Using GitHub access token instead of Copilot token")

	_, err := runtime.MessageDialog(s.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   "GitHub Access Token",
		Message: "Successfully authenticated with GitHub!\n\nNote: The Copilot internal API is not available for public use. You'll receive a GitHub access token instead, which you can use for GitHub API calls.\n\nFor actual Copilot functionality, consider using GitHub Copilot in VS Code, GitHub.com, or the GitHub CLI.",
	})
	if err != nil {
		runtime.LogWarning(s.ctx, fmt.Sprintf("Failed to show fallback dialog: %v", err))
	}

	return GitHubTokenResponse{
		AccessToken: accessToken,
		ApiKey:      accessToken, // Use access token as API key when Copilot token unavailable
	}
}
