package config

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type OAuthProvider struct {
	Key         string
	Secret      string
	CallbackURL string
}

type Config struct {
	Port             string
	DatabaseURL      string
	OAuthProviders   []string
	Providers        map[string]OAuthProvider
	JWTAccessSecret  string
	JWTRefreshSecret string
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration
	CORSAllowOrigins []string
	Env              string
	Issuer           string
	Audience         string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{}
	cfg.Port = getEnv("PORT", "8080")
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	cfg.OAuthProviders = splitAndTrim(os.Getenv("OAUTH_PROVIDERS"))
	cfg.Providers = make(map[string]OAuthProvider)
	for _, p := range cfg.OAuthProviders {
		up := strings.ToUpper(p)
		cfg.Providers[p] = OAuthProvider{
			Key:         os.Getenv(up + "_KEY"),
			Secret:      os.Getenv(up + "_SECRET"),
			CallbackURL: os.Getenv(up + "_CALLBACK_URL"),
		}
	}
	cfg.JWTAccessSecret = os.Getenv("JWT_ACCESS_SECRET")
	cfg.JWTRefreshSecret = os.Getenv("JWT_REFRESH_SECRET")
	if cfg.JWTAccessSecret == "" || cfg.JWTRefreshSecret == "" {
		return nil, errors.New("JWT secrets are required")
	}
	var err error
	cfg.JWTAccessTTL, err = time.ParseDuration(getEnv("JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return nil, err
	}
	cfg.JWTRefreshTTL, err = time.ParseDuration(getEnv("JWT_REFRESH_TTL", "720h"))
	if err != nil {
		return nil, err
	}
	cfg.CORSAllowOrigins = splitAndTrim(os.Getenv("CORS_ALLOW_ORIGINS"))
	cfg.Env = getEnv("ENV", "dev")
	cfg.Issuer = getEnv("JWT_ISSUER", "nuvin-srv")
	cfg.Audience = getEnv("JWT_AUDIENCE", "nuvin-srv")
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
