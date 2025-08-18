package security

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type JWTManager struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
	issuer        string
	audience      string
}

func NewJWTManager(accessSecret, refreshSecret, issuer, audience string, accessTTL, refreshTTL time.Duration) *JWTManager {
	return &JWTManager{
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     accessTTL,
		refreshTTL:    refreshTTL,
		issuer:        issuer,
		audience:      audience,
	}
}

func (j *JWTManager) MintAccess(userID uuid.UUID) (string, time.Time, string, error) {
	return j.mint(userID, j.accessTTL, j.accessSecret)
}

func (j *JWTManager) MintRefresh(userID uuid.UUID) (string, time.Time, string, error) {
	return j.mint(userID, j.refreshTTL, j.refreshSecret)
}

func (j *JWTManager) mint(userID uuid.UUID, ttl time.Duration, secret []byte) (string, time.Time, string, error) {
	now := time.Now()
	exp := now.Add(ttl)
	jti := uuid.NewString()
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		ID:        jti,
		Issuer:    j.issuer,
		Audience:  jwt.ClaimStrings{j.audience},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(exp),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	return signed, exp, jti, err
}

func (j *JWTManager) ParseAccess(tokenStr string) (*jwt.RegisteredClaims, error) {
	return j.parse(tokenStr, j.accessSecret)
}

func (j *JWTManager) ParseRefresh(tokenStr string) (*jwt.RegisteredClaims, error) {
	return j.parse(tokenStr, j.refreshSecret)
}

func (j *JWTManager) parse(tokenStr string, secret []byte) (*jwt.RegisteredClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	}, jwt.WithAudience(j.audience), jwt.WithIssuer(j.issuer), jwt.WithLeeway(time.Minute))
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*jwt.RegisteredClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}
