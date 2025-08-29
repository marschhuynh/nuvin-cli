package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GitHub API structures
type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	Interval        int    `json:"interval"`
	ExpiresIn       int    `json:"expires_in"`
}

type DeviceFlowStartResponse struct {
	DeviceCode      string `json:"deviceCode"`
	UserCode        string `json:"userCode"`
	VerificationURI string `json:"verificationUri"`
	Interval        int    `json:"interval"`
	ExpiresIn       int    `json:"expiresIn"`
}

type AccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	Error       string `json:"error"`
}

type DeviceFlowPollResponse struct {
	AccessToken string `json:"accessToken,omitempty"`
	Status      string `json:"status"` // "pending", "complete", "error"
	Error       string `json:"error,omitempty"`
}

type CopilotTokenResponse struct {
	Token string `json:"token"`
}

type CopilotTokenRequest struct {
	AccessToken string `json:"accessToken"`
}

type CopilotTokenAPIResponse struct {
	AccessToken string `json:"accessToken"`
	ApiKey      string `json:"apiKey"`
}

// GitHub Copilot client ID (same as in the Wails service)
const GitHubCopilotClientID = "Iv1.b507a08c87ecfe98"

// DeviceFlowStart initiates the GitHub device flow
func DeviceFlowStart(c *gin.Context) {
	// Step 1: Request device code from GitHub
	deviceBody := url.Values{
		"client_id": {GitHubCopilotClientID},
		"scope":     {"read:user"},
	}

	req, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(deviceBody.Encode()))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device code request"})
		return
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Editor-Version", "vscode/1.100.3")
	req.Header.Set("Editor-Plugin-Version", "GitHub.copilot/1.330.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.330.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to request device code"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("GitHub API error: %d", resp.StatusCode)})
		return
	}

	var deviceData DeviceCodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&deviceData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode GitHub response"})
		return
	}

	// Return device flow info to the browser
	c.JSON(http.StatusOK, DeviceFlowStartResponse{
		DeviceCode:      deviceData.DeviceCode,
		UserCode:        deviceData.UserCode,
		VerificationURI: deviceData.VerificationURI,
		Interval:        deviceData.Interval,
		ExpiresIn:       deviceData.ExpiresIn,
	})
}

// DeviceFlowPoll polls GitHub for device flow completion
func DeviceFlowPoll(c *gin.Context) {
	deviceCode := c.Param("deviceCode")
	if deviceCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Device code is required"})
		return
	}

	// Poll GitHub for access token
	tokenBody := url.Values{
		"client_id":   {GitHubCopilotClientID},
		"device_code": {deviceCode},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
	}

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(tokenBody.Encode()))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token request"})
		return
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Editor-Version", "vscode/1.100.3")
	req.Header.Set("Editor-Plugin-Version", "GitHub.copilot/1.330.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.330.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusOK, DeviceFlowPollResponse{
			Status: "error",
			Error:  "Failed to poll GitHub",
		})
		return
	}
	defer resp.Body.Close()

	var tokenData AccessTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenData); err != nil {
		c.JSON(http.StatusOK, DeviceFlowPollResponse{
			Status: "error",
			Error:  "Failed to decode GitHub response",
		})
		return
	}

	if tokenData.Error != "" {
		if tokenData.Error == "authorization_pending" || tokenData.Error == "slow_down" {
			c.JSON(http.StatusOK, DeviceFlowPollResponse{
				Status: "pending",
			})
			return
		}
		c.JSON(http.StatusOK, DeviceFlowPollResponse{
			Status: "error",
			Error:  tokenData.Error,
		})
		return
	}

	if tokenData.AccessToken != "" {
		// Verify the token works
		userReq, err := http.NewRequest("GET", "https://api.github.com/user", nil)
		if err == nil {
			userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
			userReq.Header.Set("Accept", "application/json")

			userResp, err := client.Do(userReq)
			if err == nil && userResp.StatusCode == http.StatusOK {
				userResp.Body.Close()
				c.JSON(http.StatusOK, DeviceFlowPollResponse{
					Status:      "complete",
					AccessToken: tokenData.AccessToken,
				})
				return
			}
			if userResp != nil {
				userResp.Body.Close()
			}
		}

		c.JSON(http.StatusOK, DeviceFlowPollResponse{
			Status: "error",
			Error:  "Token verification failed",
		})
		return
	}

	c.JSON(http.StatusOK, DeviceFlowPollResponse{
		Status: "pending",
	})
}

// CopilotTokenExchange exchanges a GitHub access token for a Copilot token
func CopilotTokenExchange(c *gin.Context) {
	var req CopilotTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.AccessToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Access token is required"})
		return
	}

	// Try to get Copilot token from GitHub's internal API
	copilotReq, err := http.NewRequest("GET", "https://api.github.com/copilot_internal/v2/token", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Copilot request"})
		return
	}

	copilotReq.Header.Set("Authorization", "Bearer "+req.AccessToken)
	copilotReq.Header.Set("User-Agent", "GithubCopilot/1.330.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(copilotReq)
	if err != nil {
		// Fallback: return the access token as API key
		c.JSON(http.StatusOK, CopilotTokenAPIResponse{
			AccessToken: req.AccessToken,
			ApiKey:      req.AccessToken,
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Fallback: return the access token as API key
		c.JSON(http.StatusOK, CopilotTokenAPIResponse{
			AccessToken: req.AccessToken,
			ApiKey:      req.AccessToken,
		})
		return
	}

	var copilotData CopilotTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&copilotData); err != nil {
		// Fallback: return the access token as API key
		c.JSON(http.StatusOK, CopilotTokenAPIResponse{
			AccessToken: req.AccessToken,
			ApiKey:      req.AccessToken,
		})
		return
	}

	c.JSON(http.StatusOK, CopilotTokenAPIResponse{
		AccessToken: req.AccessToken,
		ApiKey:      copilotData.Token,
	})
}