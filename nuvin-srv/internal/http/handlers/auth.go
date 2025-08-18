package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/markbates/goth/gothic"
	"gorm.io/gorm"

	"nuvin-srv/internal/config"
	"nuvin-srv/internal/models"
	"nuvin-srv/internal/security"
	"nuvin-srv/internal/store"
)

type AuthHandler struct {
	cfg    *config.Config
	db     *gorm.DB
	jwt    *security.JWTManager
	tokens *store.TokenStore
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config, jwt *security.JWTManager, ts *store.TokenStore) *AuthHandler {
	return &AuthHandler{cfg: cfg, db: db, jwt: jwt, tokens: ts}
}

func (h *AuthHandler) Begin(c *gin.Context) {
	provider := c.Param("provider")
	c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), gothic.ProviderParamKey, provider))
	gothic.BeginAuthHandler(c.Writer, c.Request)
}

func (h *AuthHandler) Callback(c *gin.Context) {
	provider := c.Param("provider")
	c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), gothic.ProviderParamKey, provider))
	u, err := gothic.CompleteUserAuth(c.Writer, c.Request)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var email *string
	if u.Email != "" {
		email = &u.Email
	}
	var user models.User
	err = h.db.Where("provider = ? AND provider_user_id = ?", provider, u.UserID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		user = models.User{
			Provider:       provider,
			ProviderUserID: u.UserID,
			Email:          email,
			Name:           u.Name,
			AvatarURL:      u.AvatarURL,
			LastLoginAt:    time.Now(),
		}
		if err = h.db.Create(&user).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if err == nil {
		user.Email = email
		user.Name = u.Name
		user.AvatarURL = u.AvatarURL
		user.LastLoginAt = time.Now()
		if err = h.db.Save(&user).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	access, _, _, err := h.jwt.MintAccess(user.ID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	refresh, _, refreshJti, err := h.jwt.MintRefresh(user.ID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// store refresh token issuance? not needed yet
	c.SetCookie("refresh_token", refresh, int(h.cfg.JWTRefreshTTL.Seconds()), "/", "", h.cfg.Env == "prod", true)
	c.JSON(http.StatusOK, gin.H{
		"accessToken":      access,
		"expiresIn":        int(h.cfg.JWTAccessTTL.Seconds()),
		"refreshToken":     refresh,
		"refreshExpiresIn": int(h.cfg.JWTRefreshTTL.Seconds()),
		"user":             user,
		"jti":              refreshJti,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	tokenStr := getRefreshToken(c)
	if tokenStr == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "refresh token required"})
		return
	}
	claims, err := h.jwt.ParseRefresh(tokenStr)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	revoked, err := h.tokens.IsRevoked(claims.ID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "store error"})
		return
	}
	if revoked {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token revoked"})
		return
	}
	// rotate: revoke old refresh token
	_ = h.tokens.Revoke(claims.ID, claims.ExpiresAt.Time)
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid subject"})
		return
	}
	access, _, _, err := h.jwt.MintAccess(uid)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	refresh, _, refreshJti, err := h.jwt.MintRefresh(uid)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.SetCookie("refresh_token", refresh, int(h.cfg.JWTRefreshTTL.Seconds()), "/", "", h.cfg.Env == "prod", true)
	c.JSON(http.StatusOK, gin.H{
		"accessToken":      access,
		"expiresIn":        int(h.cfg.JWTAccessTTL.Seconds()),
		"refreshToken":     refresh,
		"refreshExpiresIn": int(h.cfg.JWTRefreshTTL.Seconds()),
		"jti":              refreshJti,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	tokenStr := getRefreshToken(c)
	if tokenStr != "" {
		if claims, err := h.jwt.ParseRefresh(tokenStr); err == nil {
			_ = h.tokens.Revoke(claims.ID, claims.ExpiresAt.Time)
		}
	}
	if tid, ok := c.Get("tokenID"); ok {
		_ = h.tokens.Revoke(tid.(string), time.Now().Add(h.cfg.JWTAccessTTL))
	}
	c.SetCookie("refresh_token", "", -1, "/", "", h.cfg.Env == "prod", true)
	c.JSON(http.StatusOK, gin.H{"status": "logged out"})
}

func getRefreshToken(c *gin.Context) string {
	if cookie, err := c.Cookie("refresh_token"); err == nil {
		return cookie
	}
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := c.ShouldBindJSON(&req); err == nil {
		return req.RefreshToken
	}
	return ""
}

func Index(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var html string
		for _, p := range cfg.OAuthProviders {
			html += "<a href=\"/auth/" + p + "\">Login with " + p + "</a><br/>"
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<html><body>"+html+"</body></html>"))
	}
}
