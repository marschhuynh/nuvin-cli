CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_provider_user_id ON users (provider, provider_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_email ON users (provider, email);