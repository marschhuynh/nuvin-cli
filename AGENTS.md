# Repository Guidelines

## Project Structure & Module Organization
- `nuvin-ui/`: Wails app (Go backend + React frontend). Frontend lives in `nuvin-ui/frontend/`.
- `nuvin-srv/`: Go HTTP service with JWT auth, Postgres migrations, and Docker files.
- `doc/`: Design notes and reference docs.
- Root `main.go`: local experiment for keyboard hooks; not part of the Wails app.

## Build, Test, and Development Commands
- UI (Wails): `cd nuvin-ui && wails dev` — run desktop app with hot reload.
- UI build: `cd nuvin-ui && wails build` — produce binaries under `nuvin-ui/build/bin/`.
- Frontend only: `cd nuvin-ui/frontend && pnpm dev|build|preview`.
- Monorepo scripts: `pnpm dev|build|test|preview` — proxies to `frontend` via `--filter`.
- Server dev: `cd nuvin-srv && make dev` — run API locally.
- Server build/run: `cd nuvin-srv && make build && make run`.
- Server DB migrate: `cd nuvin-srv && make migrate` (requires `DATABASE_URL`).
- Docker (server): `cd nuvin-srv && docker-compose up`.

## Coding Style & Naming Conventions
- TypeScript/React: 2‑space indent, single quotes, Biome enforced. Run: `cd nuvin-ui/frontend && pnpm format`.
- Components: `PascalCase` files (e.g., `ConversationHistory.tsx`). Hooks/stores: `camelCase` (e.g., `useAgentStore.ts`).
- Go: `gofmt` formatting. For server: `cd nuvin-srv && make lint`.
- CSS: Tailwind v4 utility-first; prefer co-located styles or theme in `nuvin-ui/frontend/src/themes/`.

## Testing Guidelines
- Frontend: Vitest + Testing Library.
  - Run: `cd nuvin-ui/frontend && pnpm test` (watch), `pnpm test:run` (CI), `pnpm test:coverage`.
  - Test files live next to source or under `__tests__/` and end with `.test.ts[x]`.
- Go: standard `go test ./...` if/when tests are added. Keep unit tests near packages.
- Aim for meaningful coverage on stores, components, and core libs.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) as used in history.
  - Example: `feat: add tool permission dialog`.
- PRs: clear description, link issues, include screenshots/GIFs for UI changes, list test steps.
- CI/CD: semantic-release is configured at root; follow conventions to generate changelog.

## Security & Configuration Tips
- Do not commit secrets. Copy `nuvin-srv/.env.example` to `.env` for local dev.
- Configure provider keys via the app’s settings; avoid hardcoding in code.

## Architecture Overview
- Wails bridges Go (backend services, OAuth, proxy) and React UI.
- `nuvin-srv` provides REST endpoints, auth middleware, and DB access.
