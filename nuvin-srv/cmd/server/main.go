package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/markbates/goth"
	"github.com/markbates/goth/providers/github"
	"github.com/markbates/goth/providers/google"

	"nuvin-srv/internal/config"
	dbpkg "nuvin-srv/internal/db"
	httprouter "nuvin-srv/internal/http"
	"nuvin-srv/internal/models"
	"nuvin-srv/internal/security"
	"nuvin-srv/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := dbpkg.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	if err := db.AutoMigrate(&models.User{}, &models.RevokedToken{}); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	var providers []goth.Provider
	for _, name := range cfg.OAuthProviders {
		p := cfg.Providers[name]
		switch name {
		case "google":
			providers = append(providers, google.New(p.Key, p.Secret, p.CallbackURL, "email", "profile"))
		case "github":
			providers = append(providers, github.New(p.Key, p.Secret, p.CallbackURL, "user:email"))
		}
	}
	if len(providers) > 0 {
		goth.UseProviders(providers...)
	}

	jwt := security.NewJWTManager(cfg.JWTAccessSecret, cfg.JWTRefreshSecret, cfg.Issuer, cfg.Audience, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	tokenStore := store.NewTokenStore(db)
	router := httprouter.NewRouter(db, cfg, jwt, tokenStore)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			_ = tokenStore.CleanupExpired()
		}
	}()

	go func() {
		log.Printf("listening on %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
}
