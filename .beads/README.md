# iMsg GUI - Project Tracking (Beads)

This file is the operational tracker for the `imsg-gui` project.
Product specification lives in `PLAN.md`; issue execution lives in Beads (`.beads/issues.jsonl`).

## Project Description

`imsg-gui` is a localhost-first TypeScript web application for iMessage analytics.

Primary capabilities:

1. Ingest local macOS Messages data from `~/Library/Messages/chat.db` (read-only).
2. Import exported history from iMazing CSV/TXT.
3. Normalize both sources into one canonical SQLite model.
4. Provide a privacy-first analytics dashboard (people, conversations, timeline, insights, imports, reports).
5. Support identity merge workflows and report export.
6. Support NLP insight jobs on explicit user-selected data slices.

## Current Architecture Snapshot

1. Runtime and package manager: **Bun**.
2. Backend: Fastify + Bun SQLite (`bun:sqlite`), versioned under `/api/v1`.
3. Frontend: React + Vite + TanStack Query + ECharts.
4. Shared contracts: `packages/shared`.
5. Issue tracking: Beads, with epic and phase issues mapped in `PLAN.md`.

## Progress Tracker

| Track | Issue ID | Status | Notes |
|---|---|---|---|
| Epic: Local iMessage Analytics WebUI | `imsg-gui-xm5` | Open | Umbrella delivery issue |
| Phase 1: Core Platform | `imsg-gui-xm5.4` | Closed | Delivered |
| Phase 2: TXT/Confidence/Identity | `imsg-gui-xm5.2` | Open | Next core product phase |
| Phase 3: OAuth/NLP/Privacy | `imsg-gui-xm5.3` | Open | Follows Phase 2 |
| Phase 4: Reports/Hardening | `imsg-gui-xm5.1` | Open | Final stabilization |
| Cross-phase QA | `imsg-gui-xm5.5` | Open | Ongoing validation track |
| Bun + SQLite Migration | `imsg-gui-xm5.6` | Closed | Completed and validated |

### Bun Migration Subtasks (Completed)

| Task | Issue ID | Status |
|---|---|---|
| Migrate workspace scripts/install to Bun | `imsg-gui-xm5.6.4` | Closed |
| Introduce DB adapter abstraction | `imsg-gui-xm5.6.2` | Closed |
| Add `bun:sqlite` adapter + parity tests | `imsg-gui-xm5.6.3` | Closed |
| Cut over runtime and remove `better-sqlite3` | `imsg-gui-xm5.6.1` | Closed |
| Docs + regression validation | `imsg-gui-xm5.6.5` | Closed |

## Quality Gate Status

Bun migration gate completed with:

1. `bun run typecheck` passing.
2. `bun run test` passing.
3. `bun run build` passing.
4. API smoke checks passing (`health`, `imports`, `people`, `timeline`, `insights`, `reports`).

## Working Rules

1. Create/claim issues in Beads before implementation work.
2. Keep `PLAN.md` aligned with major execution-track changes.
3. Track follow-up work as new Beads issues instead of ad-hoc TODO notes.
4. End each work session with `bd sync --flush-only`.

## Useful Commands

```bash
bd ready
bd list --status open
bd show <issue-id>
bd update <issue-id> --status in_progress
bd close <issue-id>
bd sync --flush-only
```
