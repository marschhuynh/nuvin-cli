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
		AllowOrigins:     cfg.CORSAllowOrigins,
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if len(corsCfg.AllowOrigins) == 0 {
		corsCfg.AllowOrigins = []string{"*"}
	}
	r.Use(cors.New(corsCfg))

	authHandler := handlers.NewAuthHandler(db, cfg, jwt, ts)
	userHandler := handlers.NewUserHandler(db)
	authMw := middleware.AuthRequired(jwt, ts)

	r.GET("/healthz", handlers.Health)
	r.GET("/", handlers.Index(cfg))
	r.POST("/fetch", handlers.FetchProxy)
	r.GET("/auth/:provider", authHandler.Begin)
	r.GET("/auth/:provider/callback", authHandler.Callback)
	r.POST("/auth/refresh", authHandler.Refresh)
	r.POST("/logout", authMw, authHandler.Logout)
	r.GET("/me", authMw, userHandler.Me)

	return r
}
