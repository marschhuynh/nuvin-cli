package store

import (
	"time"

	"gorm.io/gorm"

	"nuvin-srv/internal/models"
)

type TokenStore struct {
	db *gorm.DB
}

func NewTokenStore(db *gorm.DB) *TokenStore {
	return &TokenStore{db: db}
}

func (s *TokenStore) Revoke(jti string, exp time.Time) error {
	return s.db.Create(&models.RevokedToken{TokenID: jti, ExpiresAt: exp}).Error
}

func (s *TokenStore) IsRevoked(jti string) (bool, error) {
	var count int64
	if err := s.db.Model(&models.RevokedToken{}).Where("token_id = ?", jti).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *TokenStore) CleanupExpired() error {
	return s.db.Where("expires_at < ?", time.Now()).Delete(&models.RevokedToken{}).Error
}
