# AGENTS.md — Working With This Repository

This guide helps human and automated coding agents work effectively in this monorepo. It summarizes how the project is organized, how to build and test each part, coding conventions, and operational tips.

## Project Overview

- `nuvin-ui/`: Wails desktop app (Go backend + React frontend)
  - Frontend lives in `nuvin-ui/frontend/`
- `nuvin-srv/`: Go HTTP service (JWT auth, Postgres migrations, Docker)
- `doc/`: Design notes and reference docs
- Root `main.go`: local experiment for keyboard hooks; not part of the Wails app

## Prerequisites

- Go toolchain installed
- Node.js and `pnpm`
- Wails CLI for the desktop app
- Docker (optional, for server via `docker-compose`)
- Postgres (local or remote) for server development

> Keep secrets out of the repo. Use environment variables or local `.env` files as noted below.

## Build, Run, and Test

### Desktop UI (Wails v3)

- Dev with hot reload: `cd nuvin-ui && wails3 dev`
- Build binaries: `cd nuvin-ui && wails3 task build` (uses Taskfile.yml; outputs to `nuvin-ui/build/bin/` or `nuvin-ui/build/` depending on task)
- Frontend only:
  - Dev: `cd nuvin-ui/frontend && pnpm dev`
  - Build: `cd nuvin-ui/frontend && pnpm build`
  - Preview: `cd nuvin-ui/frontend && pnpm preview`
- Monorepo helpers (proxy to frontend via `--filter`):
  - `pnpm dev | build | test | preview`

### Server (`nuvin-srv`)

- Dev: `cd nuvin-srv && make dev`
- Build: `cd nuvin-srv && make build`
- Run: `cd nuvin-srv && make run`
- DB migrations: `cd nuvin-srv && make migrate` (requires `DATABASE_URL`)
- Docker: `cd nuvin-srv && docker-compose up`

### Testing

- Frontend (Vitest + Testing Library):
  - Watch: `cd nuvin-ui/frontend && pnpm test`
  - CI: `cd nuvin-ui/frontend && pnpm test:run`
  - Coverage: `cd nuvin-ui/frontend && pnpm test:coverage`
  - Test files live next to sources or under `__tests__/`, end with `.test.ts[x]`
- Go tests (if present): run `go test ./...` in the relevant package/module

## Code Style & Conventions

- TypeScript/React
  - 2‑space indent, single quotes
  - Biome enforced: `cd nuvin-ui/frontend && pnpm format`
  - Components use `PascalCase` filenames (e.g., `ConversationHistory.tsx`)
  - Hooks/stores use `camelCase` (e.g., `useAgentStore.ts`)
  - CSS: Tailwind v4 utilities; prefer co‑located styles or theme in `nuvin-ui/frontend/src/themes/`
- Go
  - Use `gofmt` formatting
  - Server lint: `cd nuvin-srv && make lint`

## Architecture Notes

- Wails bridges a Go backend (services, OAuth, proxy) with a React UI
- `nuvin-srv` exposes REST endpoints with auth middleware and Postgres-backed data access
- Root `main.go` is an experiment; it is not part of the Wails app lifecycle

## Security & Configuration

- Never commit secrets. For local dev, copy `nuvin-srv/.env.example` to `.env`
- Provide provider/API keys via the app settings; do not hardcode
- `DATABASE_URL` must be set for `make migrate` and server DB operations
- Review Docker and compose files before deploying to ensure environment variables and volumes are correctly configured

## Commit & PR Guidelines

- Conventional Commits for messages (`feat:`, `fix:`, `chore:`, etc.)
  - Example: `feat: add tool permission dialog`
- PRs:
  - Clear description; link issues
  - Include screenshots/GIFs for UI changes
  - List test steps and any migration or config changes
- CI/CD: semantic-release is configured at the root; follow conventions to generate the changelog

## Common Agent Tasks & Pointers

- Adding a UI component
  - Place under `nuvin-ui/frontend/src/...`
  - Name files in `PascalCase.tsx`
  - Add tests alongside or in `__tests__/`
  - Run `pnpm format` to satisfy Biome
- Updating a store or hook
  - Use `camelCase` naming; add unit tests
- Styling
  - Use Tailwind utilities; update themes in `nuvin-ui/frontend/src/themes/` when appropriate
- Server changes
  - Place handlers, middleware, and services under `nuvin-srv`
  - Run `make lint` and `go fmt ./...`
  - For schema changes, add a Postgres migration and run `make migrate` (requires `DATABASE_URL`)
- Running everything locally
  - UI via `wails3 dev`
  - Server via `make dev` (set `.env` or environment vars)

## Deployment & Packaging

- Desktop app: `wails3 task build` runs the Taskfile `build` task to produce binaries (see `nuvin-ui/Taskfile.yml`)
- Packaging: `cd nuvin-ui && wails3 package` to create installers (per-platform)
- Server:
  - `make build && make run` for local
  - `docker-compose up` for containerized local deployment; ensure `.env` is configured

## Gotchas

- Do not modify or rely on the root `main.go` for the Wails app; it is unrelated
- Keep secrets and provider keys out of source control; use `.env` and settings screens
- Prefer minimal, focused changes that follow existing patterns and naming conventions
- When in doubt, add or update tests near the code you change

## Contact & Further Docs

- See `doc/` for design notes and references
- If adding significant features, include brief design notes or rationale in `doc/`
