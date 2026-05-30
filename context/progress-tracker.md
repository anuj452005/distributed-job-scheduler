# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Planning complete. Build plan created. Ready to begin implementation.

## Current Goal

- Unit 01: Repo Scaffold & Docker Compose

## Completed

- Build plan written: `flowforge/context/specs/00-build-plan.md`
- Unit specs written: `01` through `23` in `flowforge/context/specs/`

## In Progress

- None yet.

## Next Up

- Unit 01 — Repo Scaffold & Docker Compose (`01-repo-scaffold.md`)

## Open Questions

- None at this stage. All units are fully specified.

## Architecture Decisions

- **Modular monolith** over microservices for MVP — see `architecture.md`.
- **Clerk** for auth — managed JWT, zero infrastructure to operate.
- **PostgreSQL SKIP LOCKED** as the queue backend — no Kafka in MVP.
- **Redis Pub/Sub** for SSE event delivery — fire-and-forget, not source of truth.
- **AES-256-GCM** for `connection_refs` encryption — built-in Node.js `crypto`.
- **Docker Compose** for local dev only — Azure Container Apps for production.

## Session Notes

- All 23 unit spec files are in `flowforge/context/specs/`.
- Start with Unit 01. Complete verification checklist before moving to next unit.
- After each unit: ask user to test, then commit to a new git branch.
- AGENTS.md rule: commit only after user confirms "okk".
