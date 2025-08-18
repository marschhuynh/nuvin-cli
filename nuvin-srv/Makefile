BINARY=server

.PHONY: dev run build migrate lint

dev:
	go run ./cmd/server

build:
	go build -o bin/$(BINARY) ./cmd/server

run: build
	./bin/$(BINARY)

migrate:
	psql $(DATABASE_URL) -f migrations/0001_create_users.sql
	psql $(DATABASE_URL) -f migrations/0002_create_revoked_tokens.sql

lint:
	gofmt -w cmd internal
