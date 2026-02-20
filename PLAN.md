# Local iMessage Analytics WebUI - Implementation Plan

## 1. Objective

Build a localhost-first TypeScript web app that analyzes iMessage history from two equal, first-class data sources:

1. Live local macOS Messages database (`~/Library/Messages/chat.db`)
2. Imported iMazing exports (CSV and TXT)

The app must normalize both sources into one canonical model, compute descriptive and inferred metrics, and present a privacy-first people-first dashboard.

## 2. Scope

### In Scope

1. Read-only local ingestion from macOS Messages DB
2. Import ingestion for iMazing CSV and TXT
3. Unified canonical storage and analytics model
4. People-first dashboard, timeline, insights, imports, reports
5. Identity auto-merge suggestions with manual review
6. GPT-based NLP jobs through Codex OAuth on explicit user-selected slices only
7. Parse confidence and warnings surfaced in UI

### Out of Scope (V1)

1. Sending messages
2. Cloud sync and collaboration
3. Media content understanding (metadata only)
4. Multi-account tenancy

## 3. Architecture

### Frontend

1. React + TypeScript + Vite
2. TanStack Query for API state
3. Apache ECharts for visualizations
4. Privacy-first defaults (redacted content until explicit reveal)

### Backend

1. Fastify + TypeScript REST API (`/api/v1`)
2. SQLite canonical store (migrating to `bun:sqlite` with adapter abstraction)
3. Worker-thread job queue for ingestion, metrics, NLP, and reports
4. Local-only runtime (localhost)

### Integrations

1. macOS adapter for `chat.db` (read-only)
2. iMazing CSV parser
3. iMazing TXT transcript parser with fallback parsing and warning emission
4. Codex OAuth PKCE integration for GPT analysis jobs
5. macOS Keychain token storage

## 4. Canonical Data Model

Core tables:

1. `data_sources`
2. `imports`
3. `participants`
4. `conversations`
5. `conversation_participants`
6. `messages`
7. `attachments`
8. `identity_links`
9. `metrics_daily`
10. `insights`
11. `parse_warnings`
12. `nlp_jobs`
13. `audit_log`
14. `reports`

Core normalization requirements:

1. UTC timestamps at rest, local timezone on display
2. Primary dedupe via `source_id + source_msg_key`
3. Secondary fuzzy dedupe via sender + time bucket + text hash
4. Handle normalization for phone/email identity linking

## 5. API Contract (`/api/v1`)

1. `POST /sources/macos/sync`
2. `POST /imports/imazing`
3. `GET /people?range=...`
4. `GET /people/:id/metrics`
5. `GET /conversations/:id`
6. `GET /insights?scope=...`
7. `POST /identity-links/resolve`
8. `POST /nlp/jobs`
9. `GET /imports/:id/warnings`
10. `POST /reports`
11. `GET /reports/:id`

## 6. Milestones

### Phase 1 - Core Platform

1. Monorepo setup (web, server, shared types)
2. SQLite schema + migrations
3. Local macOS ingestion adapter
4. iMazing CSV ingestion
5. People-first dashboard baseline
6. Rule-based metrics foundation

### Phase 2 - Data Quality + Identity

1. iMazing TXT parser and fallback states
2. Parse warning/confidence pipeline
3. Identity auto-link heuristics
4. Manual identity merge review UI

### Phase 3 - NLP + Privacy Controls

1. Codex OAuth PKCE flow
2. Keychain token management
3. Explicit-slice GPT analysis job flow
4. Consent modal + NLP audit logging
5. Insights board confidence annotations

### Phase 4 - Reports + Hardening

1. PDF/CSV report generation
2. End-to-end Playwright regression suite
3. Performance and large-history optimization
4. Packaging and setup docs

## 7. Acceptance Criteria

1. Local and imported data appear in unified analytics views.
2. Identity merges update downstream metrics correctly.
3. Default landing page is people-first for the last 12 months.
4. GPT analysis requires explicit selected data slices.
5. Parse warnings are visible and linked to affected metrics.
6. Reports export to PDF and CSV.

## 8. Beads Integration

`PLAN.md` is the product/spec artifact only. Execution tracking remains in Beads.

Tracking map:

1. Epic: `imsg-gui-xm5` - Implement Local iMessage Analytics WebUI
2. Phase 1: `imsg-gui-xm5.4` - Core Platform
3. Phase 2: `imsg-gui-xm5.2` - TXT Import, Parse Confidence, Identity Merge
4. Phase 3: `imsg-gui-xm5.3` - Codex OAuth NLP + Privacy Controls
5. Phase 4: `imsg-gui-xm5.1` - Reports + Hardening
6. Cross-phase QA: `imsg-gui-xm5.5`
7. Runtime migration feature: `imsg-gui-xm5.6` - Bun Runtime + SQLite Migration
8. Runtime migration tasks:
9. `imsg-gui-xm5.6.4` - Migrate workspace scripts/install to Bun
10. `imsg-gui-xm5.6.2` - Introduce DB adapter abstraction
11. `imsg-gui-xm5.6.3` - Add bun:sqlite adapter + parity tests
12. `imsg-gui-xm5.6.1` - Cut over server to Bun runtime + remove better-sqlite3
13. `imsg-gui-xm5.6.5` - Docs + regression validation

Rules:

1. All implementation work is tracked as Beads issues.
2. `PLAN.md` should reference the controlling epic and phase issues.
3. New scope discovered during implementation must be added via `bd create`.
4. Session close uses `bd sync --flush-only`.

## 9. Initial Delivery Strategy

1. Build vertical slices per phase (ingest -> normalize -> view -> test).
2. Keep APIs additive under `/api/v1`.
3. Ship with privacy-first defaults enabled.
4. Execution order: complete runtime/toolchain migration (`imsg-gui-xm5.6`) before continuing Phase 2/3 implementation.

## 10. Runtime & Toolchain Migration (Bun)

Scope:

1. Bun package manager and scripts.
2. Bun server runtime.
3. SQLite driver migration to `bun:sqlite`.
4. Zero-regression validation gate.

Migration requirements:

1. Replace npm-first scripts with Bun-first scripts at root and workspaces.
2. Introduce internal DB adapter interfaces (`DatabaseClient`, `PreparedStatement`, `DbTransaction`).
3. Implement adapter-based DB entrypoint and run parity checks.
4. Cut over default DB adapter to `bun:sqlite`.
5. Remove `better-sqlite3` dependencies and imports.
6. Keep `/api/v1` contract behavior unchanged.

Validation gate:

1. `bun install`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`
5. API smoke checks for health/import/people/timeline/insights/reports

Canonical runtime default:

1. Bun is the canonical runtime and package manager after migration completion.
