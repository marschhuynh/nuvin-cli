package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Provider       string    `gorm:"index:idx_users_provider_email,unique" json:"provider"`
	ProviderUserID string    `json:"providerUserId"`
	Email          *string   `gorm:"index:idx_users_provider_email,unique" json:"email,omitempty"`
	Name           string    `json:"name"`
	AvatarURL      string    `json:"avatarUrl"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	LastLoginAt    time.Time `json:"lastLoginAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

type RevokedToken struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	TokenID   string    `gorm:"index"`
	ExpiresAt time.Time `gorm:"index"`
	CreatedAt time.Time
}

func (t *RevokedToken) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}
