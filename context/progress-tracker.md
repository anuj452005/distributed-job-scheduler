# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 0: Trigger Subsystem — Units 01-07 (Trigger Subsystem) complete.

## Current Goal

- Verification of full trigger subsystem features.

## Completed

- **Phase 0: Unit 03 — Non-Blocking Cron Scheduler**
  - Added `runCronSchedulerTick` to `@flowforge/scheduler` with a decoupled two-phase claim (Phase 1: transactional `FOR UPDATE SKIP LOCKED` to advance trigger times; Phase 2: non-transactional execution dispatch via `triggerWorkflow`).
  - Added support for `SKIP`, `RUN_ONCE`, and `CATCH_UP` misfire policies, calculating missed fire windows accurately.
  - Implemented invalid cron configuration fallback, catching parse errors and automatically updating the trigger's status in the database to `'DISABLED'`.
  - Introduced `CRON_POLL_INTERVAL_MS` environment variable (default 10000ms) and registered in API config schema.
  - Wired cron scheduler start/stop timer checks into the main scheduler daemon process.
  - Wrote robust integration tests in `index.test.ts` verifying policy resolvers, claiming logic, disabled fallbacks, and concurrent safety.

- **Phase 0: Unit 02 — `@flowforge/trigger` Package & TriggerService Scaffold**
  - Created new package `@flowforge/trigger` in `packages/trigger` with standard ESM exports and types.
  - Implemented `triggerWorkflow` function in `trigger-service.ts` for atomic trigger claim and lock-free execution dispatch.
  - Registered `@flowforge/trigger` as monorepo dependencies in `packages/api` and `packages/scheduler`.
  - Added comprehensive integration tests in `index.test.ts` verifying claiming, deduplication, cron, and failure flows. All tests pass successfully and monorepo typecheck/build compiles cleanly.

- **Phase 0: Unit 01 — Trigger Tables Schema**
  - Created [010_create_workflow_triggers.sql](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/db/migrations/010_create_workflow_triggers.sql) migration adding custom PostgreSQL ENUMs (`trigger_type`, `trigger_status`) and the `workflow_triggers` table with 4 functional indexes.
  - Created [011_create_workflow_trigger_executions.sql](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/db/migrations/011_create_workflow_trigger_executions.sql) migration adding the `trigger_execution_status` ENUM, `workflow_trigger_executions` table with the `uq_trigger_idempotency` unique constraint, and historical tracking index.
  - Built programmatic validation script [verify_migration.ts](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/db/scratch/verify_migration.ts) verifying index existence, nullable unique constraints, ON DELETE SET NULL, and ON DELETE CASCADE behaviors.
  - Executed migrations and verified schema and typecheck cleanly across all workspaces.

- **Unit 19 & 20 — Run Detail DAG & Dashboard Home**
  - Added REST API routes `GET /api/stats` and `GET /api/steps/:id/logs` to Fastify backend and registered in `server.ts`.
  - Configured query-parameter token support in `requireAuth` middleware for native EventSource client socket integrations.
  - Created ReactFlow topology workflow diagram (`DagCanvas.tsx`) using custom `StepNode.tsx` with rank status positioning via Dagre.
  - Implemented sliding drawer component (`StepDetailDrawer.tsx`) for JSON payloads, error logs, and virtualized log feed (`LogViewer.tsx`) via `@tanstack/react-virtual`.
  - Completed telemetry console page (`DashboardHomePage.tsx`) with dynamic active worker orphaned notifications, filterable lists, and real-time SSE global stream updates.
  - Integrated full type-checking and compiled whole monorepo successfully with zero compiler/bundler errors.

- **Unit 13 — Run Trigger & Status API**
  - Implemented `run-service.ts` with `triggerRun`, `getRunDetail`, `listRuns`, and `listRunsByWorkflow`.
  - `triggerRun` verifies workflow exists and has steps, delegates to `createWorkflowRun()` from `@flowforge/engine`, then inserts an audit log row recording only `workflowId` and `inputPayloadSize` (never payload contents).
  - `POST /api/workflows/:id/runs` (operator-only) returns `202 Accepted` with full `WorkflowRunDto`; root steps are `QUEUED`, non-root steps are `PENDING`.
  - `GET /api/runs/:id` returns full run state with `workflowName`, all `step_runs` joined with `stepKey` and `handlerName`.
  - `GET /api/runs` supports `page`, `limit`, `status`, `workflowId`, `from`, `to` ISO date filters.
  - `GET /api/workflows/:id/runs` returns runs scoped to a specific workflow.
  - All error cases handled: `WORKFLOW_NOT_FOUND` (404), `WORKFLOW_EMPTY` (422), `RUN_NOT_FOUND` (404), `VALIDATION_ERROR` (422), `FORBIDDEN` (403).
  - `runRoutes` Fastify plugin registered in `server.ts` under `/api` prefix.
  - 10 new integration tests added; full suite 23/23 passing, 0 failures. `tsc --noEmit` exits 0.

  - Replaced monolithic `routes/workflows.ts` stub with modular route folder `routes/workflows/` containing individual handlers for `create`, `list`, `get`, `update`, and `delete`.
  - Implemented full `workflow-service.ts` service layer with transactional `createWorkflow`, `listWorkflows`, `getWorkflow`, `updateWorkflow`, and `deleteWorkflow` DB operations.
  - `createWorkflow` and `updateWorkflow` run inside DB transactions inserting workflows, steps, and dependency edges atomically.
  - `deleteWorkflow` blocks deletion of workflows with active `RUNNING` runs (returns `409 CONFLICT`) and cascades deletion of completed `workflow_runs` before removing the workflow.
  - All mutation routes (`POST`, `PUT`, `DELETE`) insert audit log rows into `audit_logs` with `actor_id`, `action`, `resource_id`, and `metadata`.
  - DAG validation via `@flowforge/engine` `validateWorkflowDag()` runs at save time for both create and update, returning field-level `422` errors for cycles, unregistered handlers, bad retry policy bounds, etc.
  - `requireAuth` middleware extended to attach `request.userId` (alongside existing `request.userRole`) to avoid double-calling `getAuth()` in route handlers (which crashes in test env without Clerk plugin).
  - `registerAllHandlers()` call in `server.ts` guarded with a length check to prevent double-registration.
  - Written comprehensive 13-test integration suite against real Neon DB covering all CRUD paths, DAG validation errors, role guards, audit log verification, and deletion conflict checks (13/13 passing).

- **Unit 11 — API Foundation & Auth**
  - Configured `@flowforge/api` package using Fastify v5, CORS, and monorepo dependencies.
  - Implemented fail-fast Zod-based config parsing inside `config.ts`.
  - Built a global Fastify error handler inside `error-handler.ts` to log exceptions, sanitize 500 database errors, and format Zod schema violations into 422 JSON payloads.
  - Implemented Clerk-based authentication preHandler middleware (`requireAuth`) extracting roles from `publicMetadata` and supporting hermetic test-environment mocks.
  - Developed custom route-guard preHandler (`requireRole`) to enforce role-based access control (e.g. `operator` vs `viewer`).
  - Added unprotected `/health` and protected `/api/workflows` routes to test and verify access scopes.
  - Integrated startup orchestration executing DB migrations via `@flowforge/db` and booting background schedulers via `@flowforge/scheduler`, with clean lifecycle teardowns on SIGINT/SIGTERM.
  - Wrote comprehensive offline integration test suite (`index.test.ts`) covering all auth, guard, and error paths (8/8 tests passing successfully).

- **Unit 10 — Engine Package (Orchestration Brain)**
  - Implemented Kahn's algorithm for topological sorting in `topological-sort.ts` to sort workflow steps and detect cyclic dependencies.
  - Implemented DAG validator in `dag-validator.ts` covering duplicate step keys, handler existence, dependency references, retry policy bounds, and timeout limits.
  - Implemented transactional workflow run and step run creation in `run-creator.ts` and `step-pre-creator.ts`.
  - Implemented replay execution starting from a custom step in `replay.ts` by performing downstream traversal, pre-completing prior successful steps, and promoting active replay points.
  - Implemented transaction-safe cooperative run cancellation in `cancel.ts`.
  - Built a comprehensive test suite `index.test.ts` (10/10 tests passing cleanly).


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

- None.

## Next Up

- Phase 1 Implementation.

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
