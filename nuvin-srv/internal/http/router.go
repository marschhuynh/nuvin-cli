package http

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"nuvin-srv/internal/config"
	"nuvin-srv/internal/http/handlers"
	"nuvin-srv/internal/http/middleware"
	"nuvin-srv/internal/security"
	"nuvin-srv/internal/store"
)

func NewRouter(db *gorm.DB, cfg *config.Config, jwt *security.JWTManager, ts *store.TokenStore) *gin.Engine {
	r := gin.Default()
	corsCfg := cors.Config{
		AllowOrigins: cfg.CORSAllowOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders: []string{
			"Authorization", "Content-Type", "Accept", "Origin", "User-Agent", "Cache-Control",
			"editor-version", "editor-plugin-version", "openai-organization", "openai-intent",
			"x-request-id", "x-github-api-version", "Connection",
		},
		ExposeHeaders: []string{
			"Content-Type", "Cache-Control", "Connection", "Access-Control-Allow-Origin",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if len(corsCfg.AllowOrigins) == 0 {
		corsCfg.AllowOrigins = []string{"*"}
	}
	r.Use(cors.New(corsCfg))

	authHandler := handlers.NewAuthHandler(db, cfg, jwt, ts)
	userHandler := handlers.NewUserHandler(db)
	proxyService := handlers.NewProxyService()
	authMw := middleware.AuthRequired(jwt, ts)

	r.GET("/healthz", handlers.Health)
	r.GET("/", handlers.Index(cfg))
	r.POST("/fetch", handlers.FetchProxy)
	r.GET("/auth/:provider", authHandler.Begin)
	r.GET("/auth/:provider/callback", authHandler.Callback)
	r.POST("/auth/refresh", authHandler.Refresh)
	r.POST("/logout", authMw, authHandler.Logout)
	r.GET("/me", authMw, userHandler.Me)

	// GitHub Copilot device flow endpoints
	r.POST("/github/device-flow/start", handlers.DeviceFlowStart)
	r.GET("/github/device-flow/poll/:deviceCode", handlers.DeviceFlowPoll)
	r.POST("/github/copilot-token", handlers.CopilotTokenExchange)

	// Command execution endpoint
	r.POST("/execute-command", handlers.ExecuteCommand)

	// MCP stdio transport endpoints
	r.POST("/api/mcp/stdio/start", handlers.MCPStdioStart)
	r.POST("/api/mcp/stdio/send", handlers.MCPStdioSend)
	r.POST("/api/mcp/stdio/stop", handlers.MCPStdioStop)
	r.GET("/api/mcp/stdio/events/:processId", handlers.MCPStdioEvents)
	r.GET("/api/mcp/stdio/status", handlers.MCPStdioStatus)

	// Proxy configuration routes - use a different path to avoid wildcard conflicts
	r.POST("/proxy-config", proxyService.ConfigureRoute)
	r.GET("/proxy-config", proxyService.ListRoutes)

	// Proxy routes - handle all HTTP methods for /proxy/*
	r.Any("/proxy/*route", proxyService.ProxyHandler)

	return r
}
