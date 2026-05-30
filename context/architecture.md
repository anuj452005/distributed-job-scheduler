# FlowForge — Architecture

---

## Monolith vs Microservices Decision

**FlowForge is built as a modular monolith, not microservices.**

Here is why, and how it extends later:

| Concern | Modular Monolith (chosen) | Microservices (rejected for MVP) |
|---|---|---|
| Deployment complexity | One Docker Compose service per process type | One service per domain + service mesh + inter-service auth |
| Shared PostgreSQL transaction | Trivially available | Requires distributed transactions or sagas |
| Worker scaling | `docker compose up --scale worker=N` | Separate deployment unit, separate CI, separate image |
| Interview explainability | Easy end-to-end narrative | Hard to explain coordination overhead without experience |
| Debug cycle | Single log stream, single debugger | Distributed tracing required from day one |
| Extending later | Extract a module into its own service when load demands it | Already there, but with all the overhead upfront |

**The modular part matters.** Each concern lives in its own folder/module with a defined boundary (see System Boundaries below). The API does not reach into the Worker. The Engine does not talk to Redis directly. Modules communicate only through defined interfaces. This means you can extract any module into an independent service without rewriting its internals.

**Extension path:**

```
MVP (now)                          V2 / Production scale
──────────────────────────────     ──────────────────────────────────────────
Single Node.js process (API +   →  Separate API process
  Engine + Scheduler)            →  Separate Scheduler process (already a loop)
N Worker processes              →  Workers as separate Docker images / K8s pods
Redis Pub/Sub                   →  Redis Streams or Kafka for durable fanout
PostgreSQL                      →  PostgreSQL remains source of truth; read replicas
Dashboard (React)               →  Same — no change needed
```

The extraction is straightforward because module boundaries are already clean in the monolith.

---

## Stack

| Layer | Technology | Role |
|---|---|---|
| **API Server** | Node.js + Fastify + TypeScript | Handles all HTTP requests: workflow CRUD, run triggering, status queries, retry/replay/cancel, metrics endpoint, SSE stream |
| **Workflow Engine** | TypeScript module (runs inside API process) | Validates workflow DAGs, creates `WorkflowRun` + `StepRun` rows, atomically transitions downstream steps to `QUEUED` after each step succeeds |
| **Scheduler** | TypeScript timer loop (runs inside API process, extracted in V2) | Promotes delayed-retry `step_runs` where `next_run_at <= NOW()` back to `QUEUED`; V2: fires `workflow_triggers` (CRON, INTERVAL, SCHEDULED_ONCE) |
| **Worker** | Node.js + TypeScript process (separate, N instances) | Polls PostgreSQL for `QUEUED` steps, claims them with `FOR UPDATE SKIP LOCKED`, executes the matching handler, commits results with a fencing query, heartbeats the lease |
| **Handler Registry** | TypeScript in-process map (`Record<string, StepHandler>`) | Named lookup table that maps `handler_name → async function(ctx, input)`. Predefined handlers ship with the platform; custom handlers are registered by developers before worker startup |
| **Queue Backend** | PostgreSQL (`step_runs` table) | Durable, transactional job queue. `SKIP LOCKED` gives safe concurrent claiming. `next_run_at` enables delayed retries without sleeping. No Kafka in MVP |
| **Primary Database** | PostgreSQL 16 | Single source of truth for all workflow state, step state, logs, connection references, and triggers |
| **Cache / Pub-Sub** | Azure Cache for Redis (Basic C1 in MVP, Standard C1+ in production) | Real-time event bus only. Workers publish step-state-change events; SSE Gateway subscribes and pushes to dashboard. Redis is **not** a source of truth — any data in Redis can be lost and recovered from PostgreSQL. TLS enabled, no public endpoint in production |
| **SSE Gateway** | Fastify route (`GET /api/events/stream`) | Bridges Redis Pub/Sub to browser EventSource connections. Dashboard fetches full state from REST first, then merges SSE delta events |
| **Dashboard** | React 18 + TypeScript + Tailwind + ReactFlow | Operator UI. Shows live workflow runs, step DAG with state colors, queue depth, worker health, DLQ, logs. Supports retry, replay, cancel, filter, search |
| **Observability** | Prometheus (metrics endpoint) + Grafana + Pino (structured JSON logs) | Metrics: jobs/sec, queue latency p50/p95/p99, worker utilization, retry rate, DLQ depth. Logs: per-step structured entries stored in `step_logs` table |
| **Local Dev / CI** | Docker Compose | Local development only. Compose services: `api`, `worker` (scalable with `--scale`), `postgres`, `redis`, `grafana`, `prometheus`. Not used in Azure production — each service is replaced by a managed Azure equivalent (see Deployment section) |
| **Auth** | Clerk | Hosted authentication provider. Issues JWTs verified by Fastify middleware on every protected route. Handles sign-up, sign-in, session management, and user dashboard out of the box. Zero auth infrastructure to operate. Roles stored as Clerk public metadata: `operator` or `viewer` |

---

## System Boundaries

Each folder owns exactly one concern. Nothing outside the folder's boundary reaches into its internals. Communication happens only through exported interfaces.

| Folder | Owns | Must NOT |
|---|---|---|
| `packages/api/` | HTTP route handlers, request validation, response shaping, auth middleware, SSE route | Contain business logic; call `db` directly for queue operations; sleep or do blocking work |
| `packages/engine/` | `WorkflowRun` creation, `StepRun` pre-creation, dependency resolution, downstream step promotion, DAG validation, topological sort | Know about HTTP or Fastify; talk to Redis; call handler functions |
| `packages/scheduler/` | Polling loop for delayed retries (`next_run_at <= NOW()`); V2: trigger evaluation and `next_fire_at` updates | Execute handlers; claim jobs for execution; talk to Redis |
| `packages/worker/` | Job poll loop, `SKIP LOCKED` claim query, fencing-token commit, lease heartbeat, handler dispatch, crash recovery coordination | Import from `api/`; maintain any shared in-process state across concurrent workers |
| `packages/handlers/` | One file per handler (`blob-to-postgres.ts`, `http-request.ts`, etc.), handler registration function, handler input/output schemas | Read from the `step_runs` table directly; update any workflow state; call the handler registry itself |
| `packages/queue/` | All raw SQL for job claiming, lease refresh, lease sweeper, downstream step promotion | Be imported by `handlers/` or `api/` directly; own any business logic |
| `packages/db/` | PostgreSQL connection pool, migration runner, schema definitions | Be used by handlers directly; hold request-scoped state |
| `packages/events/` | Redis client, publish helpers, channel naming convention, SSE subscription management | Store durable state; be the source of truth for any workflow entity |
| `packages/dashboard/` | React app, ReactFlow DAG renderer, SSE client, REST API client, state management | Communicate with PostgreSQL or Redis directly; embed secrets |
| `packages/shared/` | TypeScript types shared across packages: `StepContext`, `StepHandler`, `WorkflowStatus`, `StepStatus`, entity DTOs | Contain runtime logic or side effects |
| `flowforge/context/` | Developer context docs (this file, `project-overview.md`, `code-standards.md`, etc.) | Be imported by any runtime code |

---

## Storage Model

### PostgreSQL — Source of Truth

Everything that must survive a process restart lives in PostgreSQL.

| Table | What lives here |
|---|---|
| `workflows` | Workflow definitions: id, name, version |
| `workflow_steps` | Step definitions: handler name, input mappings, retry policy, timeout, unique key within workflow |
| `step_dependencies` | Normalized DAG edges: `(step_id, depends_on_step_id)` — separate table, not a JSONB array |
| `workflow_runs` | One row per execution instance: status, input payload, `original_run_id` for replay lineage |
| `step_runs` | One row per step per run: status, `attempt_count`, `next_run_at`, `worker_id`, `lease_expires_at`, `idempotency_key`, `input_payload`, `output_payload`, `error_message` |
| `workflow_triggers` | V2: scheduled and cron trigger definitions with `next_fire_at` |
| `step_logs` | Structured execution logs: level, message, metadata JSONB — no raw secrets |
| `connection_refs` | Named external connection references (e.g., `azure-blob-prod`, `postgres-warehouse`) — credentials stored encrypted, never in workflow JSON |

**Critical indexes:**

```sql
-- Worker claim query: O(1) with this index
CREATE INDEX idx_step_runs_claim ON step_runs(status, next_run_at, priority DESC, created_at);

-- Lease sweeper
CREATE INDEX idx_step_runs_lease ON step_runs(status, lease_expires_at);

-- Dashboard log fetch
CREATE INDEX idx_step_logs_step_run ON step_logs(step_run_id, created_at);
```

### Azure Cache for Redis — Ephemeral Event Bus Only

Redis holds no durable state. It is a fire-and-forget Pub/Sub channel.

**Tier:** Basic C1 (1 GB) for MVP. Upgrade to Standard C1 (with replica, SLA) for production.

| Redis key pattern | What lives here | TTL |
|---|---|---|
| `flowforge:events:<channel>` | Step state-change events (JSON payloads published by workers) | None — Pub/Sub, not stored keys |
| `flowforge:worker:<worker_id>:heartbeat` | Optional: last heartbeat timestamp for dashboard worker-health display | 60 s |

Connection string format (from Azure portal → Access keys):
```
rediss://<name>.redis.cache.windows.net:6380?password=<key>
```
- Always use `rediss://` (TLS, port 6380) — not the plain `redis://` port 6379.
- Store the connection string in Azure Key Vault and inject as an environment variable (`REDIS_URL`). Never hardcode it.

If Azure Cache for Redis is unavailable, in-flight events are lost. The dashboard recovers by fetching full state from the REST API on reconnect. No workflow state is lost because PostgreSQL is the source of truth.

### Azure Blob Storage — Post-MVP Only

Not used in MVP. Post-MVP scale path:

- Raw large log files → Azure Blob Storage (hot tier)
- PostgreSQL `step_logs` keeps a summary row + blob URL pointer
- Per-workflow configurable retention policy

---

## Auth and Access Model

### Provider: Clerk (chosen)

**Why Clerk over rolling custom JWT auth:**

| Concern | Clerk | Custom JWT |
|---|---|---|
| Implementation time | ~1 hour (SDK + middleware) | 1–2 days (login, refresh, revocation, storage) |
| Security surface | Managed, audited, battle-tested | You own every edge case |
| User management UI | Built-in dashboard at clerk.com | Build your own or skip it |
| Token verification in Fastify | `@clerk/fastify` plugin — one `preHandler` hook | Custom `jsonwebtoken` verify + key rotation |
| Azure deployment | Hosted by Clerk, no infra to manage | Requires secure `JWT_SECRET` rotation strategy |
| Multi-tenant (future) | Organizations built-in | Major refactor |

**Alternative — BetterAuth** (if you need zero vendor lock-in or want to self-host):
- Open-source TypeScript auth library, runs inside your API process.
- Stores sessions in PostgreSQL (your existing DB — no new service).
- More setup than Clerk, but no dependency on an external SaaS.
- Choose BetterAuth if Clerk's free tier limits (10,000 MAU) become a concern or if you want to demonstrate owning the full auth stack.

### How Clerk Works in FlowForge

1. Dashboard (React) uses `@clerk/react` — renders Clerk's `<SignIn />` component.
2. After sign-in, Clerk issues a short-lived JWT (default 60 s, auto-refreshed by the SDK).
3. Dashboard attaches the JWT as `Authorization: Bearer <token>` on every API call.
4. Fastify API uses `@clerk/fastify` — the `clerkPlugin` verifies the token on every protected route.
5. The verified `userId` and `publicMetadata.role` are available in `request.auth` inside route handlers.
6. No session table needed in PostgreSQL. No `JWT_SECRET` to rotate.

### Roles

Roles are stored as Clerk **public metadata** on each user. Set them from the Clerk dashboard or Clerk Admin API:

```json
{ "role": "operator" }
```
or
```json
{ "role": "viewer" }
```

| Role | Can do |
|---|---|
| `operator` | All read and write operations: create/trigger/retry/replay/cancel workflows, read logs, read metrics |
| `viewer` | Read-only: `GET` endpoints only — list workflows, view runs, view logs, view metrics |

The Fastify auth middleware reads `request.auth.sessionClaims.publicMetadata.role` and enforces the role before every route handler runs.

### Ownership

MVP is single-tenant. All authenticated users see all workflows. Multi-tenant isolation (Clerk Organizations + per-org row-level security in PostgreSQL) is out of scope for MVP.

### Secret Handling

- Workflow definitions reference named connections (e.g., `"connectionRef": "postgres-warehouse"`) — never raw credentials.
- Credentials for named connections are stored encrypted in the `connection_refs` table, decrypted in memory only at handler execution time.
- Structured logs (`step_logs`) redact known secret fields before persistence. The `metadata` JSONB field must never contain a value that matches a key in `connection_refs`.
- Clerk publishable key (`CLERK_PUBLISHABLE_KEY`) is safe to expose to the browser. Secret key (`CLERK_SECRET_KEY`) lives only in the API process environment, injected from Azure Key Vault.

---

## Deployment — Azure

Docker Compose runs **application processes only** (`api`, `worker`). Data services
(PostgreSQL and Redis) are **Azure-managed in both local development and production**.
There are no local postgres or redis containers at any stage.

### What Docker Compose Does (Local Dev)

```
docker compose up --scale worker=3
```

This starts the FlowForge application processes on your machine:
- `api` container — Fastify API + Engine + Scheduler + Lease Sweeper
- `worker` container — N worker processes (scaled with `--scale`)

Both containers read `DATABASE_URL` and `REDIS_URL` from environment variables
and connect to the same Azure-managed services used in production.

Docker is also used to **build the production container images** that are pushed to Azure Container Registry and deployed to Azure.

### Azure Production Map

| Local (Docker Compose) | Azure Production |
|---|---|
| `api` container | **Azure Container Apps** — `flowforge-api` app, 1–N replicas, HTTP ingress, autoscale on CPU/requests |
| `worker` container | **Azure Container Apps** — `flowforge-worker` app, scale 1–10 replicas, no ingress (outbound-only), autoscale on custom metric (queue depth via KEDA or manual) |
| `DATABASE_URL` env var | **Azure Database for PostgreSQL — Flexible Server** (General Purpose tier, 2 vCores). Private endpoint, no public access. Used in local dev too. |
| `REDIS_URL` env var | **Azure Cache for Redis** — Basic C1 (MVP) / Standard C1 (prod). TLS-only (`rediss://`, port 6380). Used in local dev too. |
| Dashboard (React SPA) | **Azure Static Web Apps** — built by CI and deployed as a static site. Served from Azure CDN |

### Azure Resource Diagram

```
[Browser / Dashboard]  ──→  Azure Static Web Apps (React SPA)
        │
        ↓ HTTPS
[Azure Container Apps — flowforge-api]
        │
        ├─→  Azure Database for PostgreSQL (Flexible Server)  [private VNet]
        ├─→  Azure Cache for Redis (TLS 6380)                 [private VNet]
        └─→  Clerk (external HTTPS — token verification)

[Azure Container Apps — flowforge-worker]  (N replicas)
        ├─→  Azure Database for PostgreSQL  [same private VNet]
        └─→  Azure Cache for Redis          [same private VNet]

[Azure Key Vault]  ──→  injects secrets into Container Apps as env vars
[Azure Container Registry]  ──→  stores api and worker Docker images
[GitHub Actions]  ──→  builds images, pushes to ACR, deploys to Container Apps
```

### Environment Variables (production)

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Azure Key Vault secret → Container App env var |
| `REDIS_URL` | Azure Key Vault secret → Container App env var (use `rediss://` TLS URL) |
| `CLERK_SECRET_KEY` | Azure Key Vault secret → API Container App env var only |
| `CLERK_PUBLISHABLE_KEY` | Azure Static Web Apps build env var (safe to expose) |
| `ENCRYPTION_KEY` | Azure Key Vault secret → Container App env var (for `connection_refs` encryption) |

### CI/CD Pipeline (GitHub Actions)

```
push to main
  → build api Docker image  → push to Azure Container Registry
  → build worker Docker image → push to Azure Container Registry
  → deploy api image to Container Apps (flowforge-api)
  → deploy worker image to Container Apps (flowforge-worker)
  → build React dashboard → deploy to Azure Static Web Apps
  → run DB migrations (az containerapp exec or migration job)
```

### Why Not Kubernetes

Azure Container Apps is built on top of Kubernetes (AKS) internally but exposes a much simpler deployment model — no `kubectl`, no YAML manifests for pods/services/ingress, no cluster management. For FlowForge MVP, Container Apps gives:
- HTTP autoscaling for the API
- Scale-to-zero for workers (cost saving in a portfolio project)
- Built-in HTTPS ingress
- Easy secret injection from Key Vault

Migrating to AKS later is straightforward since the container images are identical.

---

## Background Task Model

FlowForge has three distinct background processes. Each runs as a separate concern with a defined polling loop.

### 1. Worker (N instances)

```
while (true) {
  stepRun = claimNextQueuedStep()         // SELECT FOR UPDATE SKIP LOCKED
  if (!stepRun) { sleep(pollInterval); continue; }

  startLeaseHeartbeat(stepRun.id)         // renew lease every ~10s

  result = await executeHandler(stepRun)  // call handler registry

  commitWithFencingToken(stepRun, result) // UPDATE ... WHERE worker_id = me AND lease_expires_at > NOW()
  // if 0 rows updated → lost lease → discard result

  promoteDownstreamSteps(stepRun)         // atomic conditional UPDATE
  publishStatusEvent(redis, stepRun)      // fire-and-forget
}
```

- Each worker is an independent Node.js process.
- Workers share no in-process state. All coordination is through PostgreSQL.
- `docker compose up --scale worker=3` starts three independent worker processes.

### 2. Scheduler (1 instance, inside API process in MVP)

```
every 5 seconds:
  promoteDelayedRetries()  // UPDATE step_runs SET status='QUEUED' WHERE status='RETRYING' AND next_run_at <= NOW()

  // V2 only:
  evaluateTriggers()       // find due workflow_triggers, create workflow_runs
```

- The Scheduler never executes handlers. It only changes `step_runs.status` from `RETRYING` → `QUEUED` so the worker poll loop can claim them.
- Workers never `sleep()` for retry delays. Sleeping would hold a worker captive and make crash recovery harder.

### 3. Lease Sweeper (1 instance, inside API process in MVP)

```
every 15 seconds:
  // Reclaim jobs from crashed workers
  UPDATE step_runs
  SET status = 'QUEUED', worker_id = NULL, lease_expires_at = NULL
  WHERE status = 'RUNNING'
    AND lease_expires_at < NOW()
    AND attempt_count < max_attempts;

  // Dead-letter poison pills
  UPDATE step_runs
  SET status = 'DEAD_LETTERED'
  WHERE status = 'RUNNING'
    AND lease_expires_at < NOW()
    AND attempt_count >= max_attempts;
```

- The sweeper is the safety net for crashed workers. It does not race with active workers because active workers' `lease_expires_at` is always in the future.

### Handler Execution Model

Every handler is a plain async TypeScript function:

```ts
type StepHandler = (ctx: StepContext, input: unknown) => Promise<unknown>;

type StepContext = {
  workflowRunId: string;
  stepRunId: string;
  attempt: number;
  idempotencyKey: string;
  signal: AbortSignal;     // cooperative cancellation
  logger: Logger;          // Pino child logger, bound to stepRunId
};
```

Predefined handlers registered at worker startup:

| Handler name | What it does |
|---|---|
| `http-request` | Issues an HTTP request with configurable method, URL, headers, body |
| `send-email` | Sends email via a configured SMTP connection reference |
| `sql-query` | Executes a parameterized SQL query on a named PostgreSQL connection |
| `blob-to-postgres` | Reads a CSV/JSON blob from Azure Blob / S3, maps columns, upserts into a target table in batches |
| `transform-json` | Applies a JSONata or jq-style transform to the input payload |
| `repo-indexer` | Clones or fetches a Git repository and indexes file contents |
| `embedding-generator` | Calls an embedding API (OpenAI, local model) on text input and returns vector output |

Custom handlers are registered by developers before worker startup:

```ts
handlerRegistry.register("my-custom-handler", async (ctx, input) => {
  // custom logic
  return { result: "done" };
});
```

---

## Invariants

These rules must never be violated anywhere in the codebase. They are not conventions — they are correctness requirements. Violating them causes silent data loss, duplicate execution, or stale dashboard state.

### 1. PostgreSQL is the only source of truth for workflow state

Redis holds no durable state. Any value that determines workflow correctness (status, attempt count, output payload, error message, lease expiry, retry time) lives exclusively in PostgreSQL. Redis Pub/Sub events are fire-and-forget notifications. If they are lost, the dashboard recovers from the REST API. No code path may write a canonical workflow state value to Redis.

### 2. A worker must commit its result using the fencing-token query

A worker must only write `SUCCEEDED` (or `FAILED`) to a `step_run` row using this exact condition:

```sql
WHERE id = :step_run_id
  AND worker_id = :worker_id
  AND status = 'RUNNING'
  AND lease_expires_at > NOW()
```

If the update affects 0 rows, the worker lost its lease. It must discard the execution result and not write `output_payload`, not publish a success event, and not promote downstream steps. A worker that commits without this fencing check can cause two workers to both record a successful result for the same step run.

### 3. A step must never transition to `QUEUED` more than once per attempt group

All `StepRun` rows are pre-created in `PENDING` state when the `WorkflowRun` is initialized. The downstream promotion query uses:

```sql
UPDATE step_runs SET status = 'QUEUED'
WHERE status = 'PENDING'
  AND NOT EXISTS (/* any parent with status != 'SUCCEEDED' */)
```

The `UNIQUE (workflow_run_id, step_id)` constraint is the final safeguard. No code path may create a new `StepRun` row for a step that already has one within the same `WorkflowRun`. Creating step runs on-the-fly (outside the pre-creation phase) is forbidden.

### 4. Raw secrets and credentials must never appear in `step_logs`, `step_runs`, or `workflow_steps`

Workflow definitions reference connection names only (`"connectionRef": "postgres-warehouse"`). Decrypted credentials exist in memory only during handler execution and must not be logged, serialized to `output_payload`, or included in `error_message`. The log-persistence layer must strip any field whose key appears in the `connection_refs` table before writing to `step_logs`.

### 5. A handler must never update `step_runs` or `workflow_runs` directly

Handlers return a plain JSON-serializable value or throw an error. The worker process owns all writes to `step_runs` (status, output, error, lease). A handler that directly updates its own `step_run` row bypasses the fencing check, breaks the lease model, and can cause split-brain state between the worker and the sweeper.

### 6. The Scheduler and Lease Sweeper must not execute handlers

The Scheduler updates `step_runs.status` and `step_runs.next_run_at`. The Lease Sweeper updates `step_runs.status` and clears `worker_id`. Neither process may call into the handler registry or execute any handler function. Execution is exclusively the Worker's responsibility.

### 7. Workflow DAG validation must pass before a workflow is saved

A workflow with a cycle, an unregistered handler, an unresolvable dependency reference, or an unreachable step must be rejected at `POST /api/workflows` time with a descriptive validation error. The system must not store a workflow that can never execute correctly. A workflow that passes validation is guaranteed to be topologically sortable and claimable by workers.

### 8. Workers must never `sleep()` for retry delays

Retry delays are persisted as `step_runs.next_run_at = NOW() + retryDelay`. The Scheduler promotes due retries. A worker that sleeps for a retry delay holds a worker slot hostage, cannot be cleanly shut down during graceful shutdown, and prevents crash recovery from reclaiming the slot. All time-based scheduling flows through `next_run_at` + the Scheduler loop.

---

## Key Sequence: End-to-End Step Execution

```
POST /api/workflows/:id/runs
  └─ Engine: create workflow_run (PENDING → RUNNING)
  └─ Engine: create all step_runs (PENDING)
  └─ Engine: promote root steps (PENDING → QUEUED)

Worker poll loop (every N ms):
  └─ SELECT FOR UPDATE SKIP LOCKED → claim step_run
  └─ UPDATE step_run: status=RUNNING, worker_id, lease_expires_at, attempt_count++
  └─ Start lease heartbeat (renews every 10s)
  └─ Execute handler(ctx, input)
  │
  ├─ SUCCESS:
  │   └─ UPDATE step_run (fencing): status=SUCCEEDED, output_payload
  │   └─ Engine: promote downstream steps (PENDING → QUEUED) where all parents SUCCEEDED
  │   └─ Publish step.succeeded event → Redis → SSE → Dashboard
  │   └─ If all steps SUCCEEDED → UPDATE workflow_run: status=COMPLETED
  │
  └─ FAILURE:
      └─ attempt_count < max_attempts:
      │   └─ UPDATE step_run: status=QUEUED (retry), next_run_at=future
      │   └─ Publish step.retry event
      └─ attempt_count >= max_attempts:
          └─ UPDATE step_run: status=DEAD_LETTERED
          └─ UPDATE workflow_run: status=FAILED
          └─ Publish step.dead_lettered event

Lease Sweeper (every 15s):
  └─ Find RUNNING step_runs where lease_expires_at < NOW()
  └─ Re-queue (if attempts remain) or dead-letter (if exhausted)
```
