# iMsg GUI

Local-first iMessage analytics web UI with equal support for:

- live macOS Messages DB (`~/Library/Messages/chat.db`)
- imported iMazing exports (CSV/TXT)

## Stack

- `apps/server`: Fastify + SQLite (`bun:sqlite`)
- `apps/web`: React + Vite + TanStack Query + ECharts
- `packages/shared`: shared API/type contracts

## Run

```bash
bun install
bun run dev
```

- Web UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787/api/v1`

## Important macOS Requirement

For local Messages sync, grant Full Disk Access to the terminal/app running the server.

macOS path used:

- `~/Library/Messages/chat.db`

## Implemented API (`/api/v1`)

- `GET /health`
- `POST /sources/macos/sync`
- `POST /imports/imazing`
- `GET /imports`
- `GET /imports/:id/warnings`
- `GET /people?range=90d|12m|all`
- `GET /people/:id/metrics`
- `GET /conversations`
- `GET /conversations/:id`
- `GET /timeline?range=...`
- `GET /insights`
- `GET /identity-links/suggestions`
- `POST /identity-links/resolve`
- `POST /nlp/jobs`
- `POST /reports`
- `GET /reports`
- `GET /reports/:id`
- `GET /oauth/codex/status`

## Beads

Tracking is in `bd` issues and linked from `PLAN.md`.

## Validation

```bash
bun run typecheck
bun run test
bun run build
```
