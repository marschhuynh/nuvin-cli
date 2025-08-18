# nuvin-srv

Starter server using Gin, GORM, Goth and JWT tokens. Supports Google and GitHub OAuth and issues short lived access tokens with long lived refresh tokens.

## Quick start

```bash
# copy env and edit values
cp .env.example .env
# start postgres and server
docker compose up --build
```

Run migrations manually if required:

```bash
make migrate
```

The server listens on `http://localhost:8080`.

## OAuth keys

Create OAuth apps for Google and GitHub and set the callback URLs to:

- `http://localhost:8080/auth/google/callback`
- `http://localhost:8080/auth/github/callback`

Update `.env` with the issued client IDs and secrets.

## cURL examples

After logging in via browser and obtaining the tokens:

Refresh using JSON body:

```bash
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<token>"}'
```

Refresh using cookie:

```bash
curl -X POST http://localhost:8080/auth/refresh \
  -b "refresh_token=<token>"
```

Logout and revoke tokens:

```bash
curl -X POST http://localhost:8080/logout \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<token>"}'
```

`GET /me` with a valid access token returns the current user.

## Development

Useful commands:

```bash
make dev     # run in dev mode
make build   # build binary
make lint    # format code
```

