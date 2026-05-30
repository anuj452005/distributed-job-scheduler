# Code Standards

## General

- Keep every module small and single-purpose. A file that does two unrelated things should be two files.
- Fix root causes, not symptoms. Do not add a try/catch to silence an error that should be fixed upstream.
- Do not mix concerns across package boundaries. `packages/engine/` must not import from `packages/worker/`. See `architecture.md` → System Boundaries.
- Prefer explicit over implicit. Name things after what they do, not where they are called from.
- Delete dead code. Do not comment out code and leave it. Remove it; version control has the history.

---

## TypeScript

- Strict mode is required in every `tsconfig.json`. `"strict": true` — no exceptions.
- Never use `any`. Use `unknown` at system boundaries and narrow with type guards. Use explicit interfaces or union types for everything internal.
- Validate all external input at package boundaries using a schema validator (Zod). Never trust raw `req.body`, raw query params, or raw handler output.
- Do not use non-null assertion (`!`) unless you can prove the value is non-null at that point. Prefer explicit guards.
- Use `type` for data shapes and DTOs. Use `interface` only when you intend to extend or implement.
- Export only what the package's public API requires. Do not export internal implementation details.
- Every async function must handle its error path. Do not leave floating Promises. Always `await` or `.catch()`.

---

## Fastify (API Server)

- Every route handler must be declared with full TypeScript generics: `RouteHandler<{ Body: X; Reply: Y }>`.
- Validate request body, params, and query with a Fastify JSON schema or a Zod schema via `fastify-type-provider-zod`.
- Enforce auth and ownership in a `preHandler` hook before any route handler logic runs.
- Route handlers are thin. Move business logic into the engine or service layer. A route handler's only jobs are: validate, authorize, call a service, return a response.
- Return consistent response shapes. Success responses: `{ data: T }`. Error responses: `{ error: { code: string, message: string } }`.
- Never `throw` from inside a route handler to signal a validation failure. Use `reply.code(400).send(...)`.
- The SSE route (`GET /api/events/stream`) must set `Connection: keep-alive`, `Cache-Control: no-cache`, and handle client disconnect by unsubscribing from Redis.

---

## React (Dashboard)

- Keep components focused. A component that renders a table, handles its own data fetch, and controls a modal is too large. Split it.
- Use the SSE client hook (`useSSE`) for real-time updates. Never poll with `setInterval` to refresh dashboard state.
- Merge SSE delta events into local state; do not replace full state from SSE alone. Always fetch full state from REST on mount and on SSE reconnect.
- ReactFlow DAG nodes must derive their color solely from the `StepStatus` token in `ui-context.md`. Never hardcode hex values in node renderers.
- Do not call the Fastify API directly from deeply nested components. Fetch at page or layout level and pass data down, or use a React Query / SWR cache.

---

## Styling

- Use CSS custom property tokens exclusively — no hardcoded hex values, no hardcoded `px` sizes outside the defined scale.
- Every color must reference a token from `ui-context.md` (e.g., `var(--bg-surface)`, `var(--state-succeeded)`).
- Follow the border radius scale in `ui-context.md`. Do not introduce new radius values.
- Tailwind utility classes are allowed for spacing and layout. For colors, always use custom property tokens, not Tailwind color classes (e.g., use `bg-[var(--bg-surface)]`, not `bg-gray-900`).
- Status colors (QUEUED, RUNNING, SUCCEEDED, FAILED, RETRYING, DEAD_LETTERED, CANCELLED) must always use the canonical tokens. These are used in the DAG, tables, and badges — they must be consistent everywhere.

---

## API Routes

- Validate and parse request input with Zod before any logic runs. Never access `req.body.someField` without prior validation.
- Enforce auth (Clerk JWT verification via `@clerk/fastify`) and role check (`operator` vs `viewer`) before any mutation. A `viewer` hitting a mutating route must receive a `403` before any DB access.
- All mutations (create workflow, trigger run, retry step, replay, cancel) must be idempotent or explicitly document why they are not.
- Return `404` when a resource is not found. Return `409` for conflict (e.g., replaying a run that is still active). Return `422` for validation errors with field-level detail.
- Never expose internal PostgreSQL error messages or stack traces in API responses. Log them server-side; return a sanitized error to the client.

---

## Worker and Queue

- The worker claim query must always use `FOR UPDATE SKIP LOCKED` inside a transaction that immediately updates the row. Never claim without immediately locking.
- The fencing-token commit query must include `AND worker_id = :me AND lease_expires_at > NOW() AND status = 'RUNNING'`. If 0 rows are updated, discard the result silently — do not retry the commit.
- The lease heartbeat must renew `lease_expires_at` every 10 seconds for long-running handlers. A handler that does not produce a heartbeat within 30 seconds will have its step re-claimed by the sweeper.
- Workers must handle `SIGTERM` by finishing the current handler execution (or waiting up to 30 seconds) and then exiting cleanly. Do not `process.exit(0)` mid-handler.
- Never sleep for retry delays. Set `next_run_at` in PostgreSQL. The Scheduler promotes the row.

---

## Data and Storage

- Workflow state (status, output, error, attempt count, lease) belongs in PostgreSQL — never in Redis or in-memory.
- Redis is used only for fire-and-forget Pub/Sub events. Never write to Redis if the same data must survive a Redis restart.
- Do not store raw secrets, connection strings, or decrypted credentials in any database column, log entry, or response body. Store named `connectionRef` keys only.
- Large binary content (raw log files, blobs) does not go in PostgreSQL columns. In MVP, structured logs go in `step_logs`. Post-MVP, raw log payloads go to Azure Blob Storage with a pointer in `step_logs`.
- Every migration is forward-only. Do not write a migration that drops a column or table. Instead, add a new column/table in one migration and remove the old one in a later migration after the code no longer references it.

---

## File Organization

- `packages/api/` — Fastify server entry, route declarations, auth middleware, SSE route. No business logic.
- `packages/engine/` — `WorkflowRun` creation, `StepRun` pre-creation, DAG validation, downstream step promotion, topological sort.
- `packages/scheduler/` — Retry promotion loop, V2 trigger evaluation. No handler execution.
- `packages/worker/` — Poll loop, claim query, fencing commit, lease heartbeat, handler dispatch, graceful shutdown.
- `packages/handlers/` — One file per handler. Handler registration function. Input/output Zod schemas per handler.
- `packages/queue/` — Raw SQL for job claiming, lease refresh, lease sweeper query, downstream promotion query.
- `packages/db/` — PostgreSQL pool, migration runner. No business logic.
- `packages/events/` — Redis client, publish helpers, SSE subscription helpers. No workflow state writes.
- `packages/shared/` — TypeScript types only. No runtime logic, no side effects, no imports from other packages.
- `packages/dashboard/` — React app, ReactFlow renderer, SSE hook, REST client. No direct DB or Redis access.
- `flowforge/context/` — Documentation only. Never imported by runtime code.
