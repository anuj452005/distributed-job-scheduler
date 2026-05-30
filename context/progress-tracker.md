# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Implementation in progress. Unit 09 fully built, verified, and compiled.

## Current Goal

- Unit 10: Engine Package

## Completed

- **Unit 09 — Events Package (Redis Pub/Sub)**
  - Configured `@flowforge/events` with standard ESM module architecture (`"type": "module"`) and monorepo dependencies.
  - Implemented dynamic Redis client setup in `redis-client.ts` supporting standard connection config and robust fallback to in-memory `ioredis-mock` for testing/fallback environments.
  - Created standardized Channel & Key naming utility structure in `channels.ts`.
  - Implemented fire-and-forget `publishStepEvent` in `publish.ts` with try/catch wrapper preventing Redis failures from throwing or crashing.
  - Developed standard subscription and unsubscription hook logic in `subscribe.ts` for run-specific events (`subscribeToRunEvents`) and global updates (`subscribeToGlobalEvents`).
  - Implemented clean entrypoint exports and fully comprehensive test suite `index.test.ts` (5/5 tests passing successfully).
  - Verified package typechecking, integration tests, and monorepo workspace compiling cleanly.

- **Unit 08 — Scheduler & Lease Sweeper**
  - Configured `@flowforge/scheduler` with standard ESM module architecture (`"type": "module"`) and monorepo dependencies.
  - Implemented `scheduler-context.ts` tracking running status and active timers for safe lifecycle orchestration.
  - Developed `retry-scheduler.ts` triggering delayed step promotions from `RETRYING` to `QUEUED` safely and idempotently.
  - Developed `lease-sweeper.ts` implementing heartbeat sweep checks to reclaim crashed worker leases and dead-letter exhausted step runs (marking parent workflow runs as `FAILED` using the `getWorkflowRunIdForStep` and `moveToDeadLetter` helper sequence).
  - Wrote comprehensive integration test suite verifying precise crash recovery scenarios and start/stop behavior.
  - Successfully verified building, typechecking, and testing across the entire monorepo with zero compilation errors.
- Build plan written: `flowforge/context/specs/00-build-plan.md`
- Unit specs written: `01` through `23` in `flowforge/context/specs/`
- **Unit 07 — Worker Process**
  - Configured `@flowforge/worker` package.json and Dockerfile for monorepo imports and ESM support.
  - Implemented `worker-id.ts` for stable process name generation.
  - Developed `graceful-shutdown.ts` offering standard cooperative handler cancellation on SIGTERM/SIGINT signals.
  - Created `lease-heartbeat.ts` providing timer-based DB lease updates with automated abort callbacks.
  - Built `poll-loop.ts` driving standard atomic claiming, handling dispatching, fencing token commits, downstream step promotions, and parent workflow run completion checks.
  - Orchestrated and verified all packages compiling and building cleanly (10/10 workspaces successfully verified).
- **Unit 01 — Repo Scaffold & Docker Compose**
  - Scaffolded npm workspaces monorepo at `flowforge/` containing 10 packages.
  - Configured shared `tsconfig.base.json` with strict ES2022/NodeNext options.
  - Setup `.env.example` defining all 9 database, cache, auth, and worker settings.
  - Configured `docker-compose.yml` for `api` and `worker` applications pointing to cloud services.
  - Scaffolded `@flowforge/dashboard` with Vite, React 19, TypeScript, and initialized Tailwind CSS v4 + shadcn/ui.
  - Verified that all workspace packages build and compile without TypeScript or bundler errors.
- **Unit 02 — Database Schema & Migrations**
  - Designed and created 9 forward-only SQL migration files in `packages/db/migrations/` defining the core schema of the system.
  - Defined 8 core tables: `workflows`, `workflow_steps`, `step_dependencies`, `workflow_runs`, `step_runs` (queue), `step_logs`, `connection_refs`, `audit_logs`.
  - Configured strict keys, defaults, check constraints, foreign keys, and active ON DELETE CASCADE rules.
  - Defined 5 critical performance indexes for fast job claiming, lease sweeping, dashboard logs, and run lookups.
  - Created a custom TypeScript automated script to run migrations, verify schemas and indexes, and test cascading deletes.
  - Verified migrations apply idempotently and correctly against a live Neon PostgreSQL database.
- **Unit 03 — Shared Types Package**
  - Created status enums (`WorkflowStatus`, `StepStatus`, `AuditAction`, `LogLevel`) in `packages/shared/src/status.ts`.
  - Created step definitions and event structures (`StepContext`, `StepHandler`, etc.) using `pino`'s `Logger` in `packages/shared/src/types.ts`.
  - Defined standard database table row structures (`WorkflowRow`, `WorkflowStepRow`, etc.) in `packages/shared/src/entities.ts`.
  - Defined serializable camelCase API DTO request/response bodies in `packages/shared/src/dto.ts`.
  - Re-exported all sub-modules from the entrypoint `packages/shared/src/index.ts` and successfully verified compilation of the entire workspace monorepo.
- **Unit 04 — DB Package & Connection Pool**
  - Developed `@flowforge/db` package with a single PostgreSQL connection pool exported as `db`.
  - Built a migration runner that loads SQL files sequentially and executes them within a single transaction on startup.
- **Unit 05 — Queue SQL Package**
  - Developed `@flowforge/queue` package encapsulating all raw concurrency-critical SQL queries.
  - Implemented concurrent-safe task claiming (`claimStepRun`) using PostgreSQL row-level locks (`SELECT FOR UPDATE SKIP LOCKED`).
  - Added lease maintenance (`heartbeatStepRun`), worker crash recovery (`sweepLeases`), and workflow execution chain progression (`promoteStepRun`).
- **Unit 06 — Handler Registry & Core Handlers**
  - Built `@flowforge/handlers` package including a central, duplicate-safe `HandlerRegistry` for mapping task keys to async handlers.
  - Created strict Zod schema validation files for all 7 core step handlers.
  - Implemented fully functional `http-request` (with native `AbortSignal.any()` combining timeout and cooperative cancellation signals) and `transform-json` (utilizing JSONata evaluation) handlers.
  - Added structured MVP stubs for `send-email`, `sql-query`, `blob-to-postgres`, `repo-indexer`, and `embedding-generator` with Pino child logging and cancellation guards.
  - Wrote comprehensive unit test suite in `index.test.ts` checking all behaviors (15/15 tests passing) and verified workspace compile & build compatibility.

## In Progress

- None. Ready for Unit 07.

## Next Up

- Unit 07 — Worker Process (`07-worker.md`)


## Open Questions

- None.

## Architecture Decisions

- **Modular monolith** over microservices for MVP — see `architecture.md`.
- **Clerk** for auth — managed JWT, zero infrastructure to operate.
- **PostgreSQL SKIP LOCKED** as the queue backend — no Kafka in MVP.
- **Redis Pub/Sub** for SSE event delivery — fire-and-forget, not source of truth.
- **AES-256-GCM** for `connection_refs` encryption — built-in Node.js `crypto`.
- **Docker Compose** for local dev only — Azure Container Apps for production.

## Session Notes

- Monorepo setup completed successfully. All workspace packages are connected.
- Tailwind CSS v4 and shadcn/ui successfully integrated into the Vite React 19 dashboard.
- Verified workspace builds cleanly with `npm run build`.
- Switched to git `master` branch. Ready for user verification and unit handover.
