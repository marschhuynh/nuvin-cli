# Nuvin Server

A lightweight [Gin](https://github.com/gin-gonic/gin) HTTP server used by the web client to proxy requests when running in browser mode.

## Endpoints

- `GET /health` – basic health check returning `ok`.
- `POST /fetch` – proxies an arbitrary HTTP request. Accepts JSON matching the Wails `FetchProxy` request shape and returns the proxied response.

## Running

```bash
cd nuvin-srv
# run directly
go run .
# or build a binary
# go build -o nuvin-srv
```

The server listens on `http://localhost:8080`.

## Testing

```bash
go test ./...
```
