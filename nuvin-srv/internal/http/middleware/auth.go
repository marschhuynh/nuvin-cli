package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nuvin-srv/internal/security"
	"nuvin-srv/internal/store"
)

func AuthRequired(jwt *security.JWTManager, ts *store.TokenStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			return
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		claims, err := jwt.ParseAccess(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		revoked, err := ts.IsRevoked(claims.ID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "store error"})
			return
		}
		if revoked {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token revoked"})
			return
		}
		c.Set("userID", claims.Subject)
		c.Set("tokenID", claims.ID)
		c.Next()
	}
}
