# FlowForge — Architecture

This document describes the architectural design, technology choices, boundaries, storage models, and safety invariants for the FlowForge distributed workflow orchestration and background processing platform.

---

## Monolith vs Microservices Decision

**FlowForge is built as a modular monolith, not microservices.**

Here is why, and how it extends later:

| Concern | Modular Monolith (chosen) | Microservices (rejected for MVP) |
|---|---|---|
| **Deployment complexity** | One Docker Compose service per process type | One service per domain + service mesh + inter-service auth |
| **Shared PostgreSQL transaction** | Trivially available | Requires distributed transactions or sagas |
| **Worker scaling** | `docker compose up --scale worker=N` | Separate deployment unit, separate CI, separate image |
| **Explainability** | Easy end-to-end narrative | Hard to explain coordination overhead without experience |
| **Debug cycle** | Single log stream, single debugger | Distributed tracing required from day one |
| **Extending later** | Extract a module into its own service when load demands it | Already there, but with all the overhead upfront |

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

The following table outlines the technology stack layers and their respective roles, including the programmatic container sandbox execution layer introduced in Phase 1.

| Layer | Technology | Role |
|---|---|---|
| **API Server** | Node.js + Fastify + TypeScript | Handles all HTTP requests: workflow CRUD, run triggering, status queries, retry/replay/cancel, metrics endpoint, SSE stream. |
| **Workflow Engine** | TypeScript module (runs inside API process) | Validates workflow DAGs, creates `WorkflowRun` + `StepRun` rows, atomically transitions downstream steps to `QUEUED` after each step succeeds. |
| **Scheduler** | TypeScript timer loop (runs inside API process) | Promotes delayed-retry `step_runs` where `next_run_at <= NOW()` back to `QUEUED`. In V2, evaluates cron/interval triggers. |
| **Worker** | Node.js + TypeScript process (separate, N instances) | Polls PostgreSQL for `QUEUED` steps, claims them with `FOR UPDATE SKIP LOCKED`, executes the matching handler, commits results with a fencing query, and manages heartbeats. |
| **Handler Registry** | TypeScript in-process map (`Record<string, StepHandler>`) | Named lookup table that maps `handler_name` → `async function(ctx, input)`. Dispatches executions to specialized TypeScript handlers or the Docker runner. |
| **Container Engine** | Docker Daemon (accessed via `/var/run/docker.sock`) | The host service responsible for managing the lifecycle (create, start, wait, kill, remove) of isolated task sandboxes. |
| **Container SDK** | `dockerode` (programmatic Node.js client) | Used by workers to communicate with the Docker daemon programmatically to run scripts and stream logs/status. |
| **Sandbox Runtime** | gVisor (`runsc`) or standard Docker cgroups | Kernel-level sandboxing (via gVisor) or strict cgroup control to contain untrusted user Python execution. |
| **Sandbox Image** | `python:3.10-slim` | Hardened base Python container image configured to run as non-root user `1000:1000`. |
| **Queue Backend** | PostgreSQL (`step_runs` table) | Durable, transactional job queue. `SKIP LOCKED` gives safe concurrent claiming. `next_run_at` enables delayed retries. |
| **Primary Database** | PostgreSQL 16 | Single source of truth for all workflow definitions, execution states, step states, step logs, triggers, and connection references. |
| **Cache / Pub-Sub** | Azure Cache for Redis (Basic C1 in MVP, Standard C1+ in production) | Real-time event bus only. Workers publish step-state-change events; SSE Gateway subscribes and pushes to dashboard. Redis is **not** a source of truth. |
| **SSE Gateway** | Fastify route (`GET /api/events/stream`) | Bridges Redis Pub/Sub to browser EventSource connections. Dashboard fetches full state from REST first, then merges SSE delta events. |
| **Dashboard** | React 18 + TypeScript + Tailwind + ReactFlow | Operator UI. Shows live workflow runs, step DAG with state colors, queue depth, worker health, DLQ, and logs. Supports retry, replay, and cancel. |
| **Observability** | Prometheus (metrics) + Grafana + Pino (JSON logs) | Metrics: jobs/sec, latency percentiles, worker utilization, retry rate, DLQ depth. Logs: per-step structured entries stored in `step_logs` table. |
| **Local Dev / CI** | Docker Compose | Runs application containers (`api`, `worker`) locally. Azure equivalent services are used for database and caching dependencies. |
| **Auth** | Clerk | Hosted authentication provider. Issues JWTs verified by Fastify middleware. Roles (`operator`, `viewer`) are stored in Clerk public metadata. |

---

## System Boundaries

Each folder owns exactly one concern. Nothing outside the folder's boundary reaches into its internals. Communication happens only through exported interfaces.

| Folder | Owns | Must NOT |
|---|---|---|
| `packages/api/` | HTTP route handlers, request validation, response shaping, auth middleware, SSE route | Contain business logic; call `db` directly for queue operations; sleep or do blocking work. |
| `packages/engine/` | `WorkflowRun` creation, `StepRun` pre-creation, dependency resolution, downstream step promotion, DAG validation, topological sort | Know about HTTP or Fastify; talk to Redis; call handler functions. |
| `packages/scheduler/` | Polling loop for delayed retries (`next_run_at <= NOW()`); V2: trigger evaluation and `next_fire_at` updates | Execute handlers; claim jobs for execution; talk to Redis. |
| `packages/worker/` | Job poll loop, `SKIP LOCKED` claim query, fencing-token commit, lease heartbeat, handler dispatch, crash recovery coordination | Import from `api/`; maintain any shared in-process state across concurrent workers. |
| `packages/handlers/` | Named handlers (including the `python-script` Docker execution runtime), handler registration map, handler input/output schemas | Read from the `step_runs` table directly; update any workflow state; call the handler registry itself. |
| `packages/queue/` | All raw SQL for job claiming, lease refresh, lease sweeper, downstream step promotion | Be imported by `handlers/` or `api/` directly; own any business logic. |
| `packages/db/` | PostgreSQL connection pool, migration runner, schema definitions | Be used by handlers directly; hold request-scoped state. |
| `packages/events/` | Redis client, publish helpers, channel naming convention, SSE subscription management | Store durable state; be the source of truth for any workflow entity. |
| `packages/dashboard/` | React app, ReactFlow DAG renderer, SSE client, REST API client, state management | Communicate with PostgreSQL or Redis directly; embed secrets. |
| `packages/shared/` | TypeScript types shared across packages: `StepContext`, `StepHandler`, `WorkflowStatus`, `StepStatus`, entity DTOs | Contain runtime logic or side effects. |
| `flowforge/context/` | Developer context docs (`project-overview.md`, `code-standards.md`, etc.) | Be imported by any runtime code. |

---

## Storage Model

FlowForge splits data persistence across three distinct storage domains to balance transactional integrity, scale, and performance.

```
┌────────────────────────────────────────────────────────┐
│                      FLOWFORGE TIERED STORAGE          │
├───────────────────┬────────────────────────────────────┤
│ 1. Database       │ PostgreSQL 16 (Source of Truth)    │
├───────────────────┼────────────────────────────────────┤
│ 2. File Storage   │ Host Filesystem (Workspaces/Venvs) │
├───────────────────┼────────────────────────────────────┤
│ 3. Cache / Bus    │ Azure Cache for Redis (Ephemera)   │
└───────────────────┴────────────────────────────────────┘
```

### 1. Database (PostgreSQL 16) — Source of Truth
Everything that must survive a process restart lives in PostgreSQL. No database migrations are allowed for Phase 1. Python configurations run from the `input_config` JSONB field in `workflow_steps`.

| Table | What lives here |
|---|---|
| `workflows` | Workflow definitions: id, name, version. |
| `workflow_steps` | Step definitions: handler name, input mappings (e.g. `input_config` JSONB for script code, requirements list), retry policy, timeout, unique step key. |
| `step_dependencies` | Normalized DAG edges: `(step_id, depends_on_step_id)`. |
| `workflow_runs` | One row per execution instance: status, input payload, `original_run_id` for replay lineage. |
| `step_runs` | One row per step per run: status, `attempt_count`, `next_run_at`, `worker_id`, `lease_expires_at`, `idempotency_key`, `input_payload`, `output_payload`, `error_message`. |
| `step_logs` | Structured execution logs and container stdout/stderr records bound to a `step_run_id`. |
| `connection_refs` | Named external connection references (credentials stored encrypted in DB). |

### 2. File Storage (Host Filesystem) — Workspaces & Dependencies
The host worker filesystem is utilized for compiling, caching, and mounting runtime workspaces.

- **Temporary Workspaces**: Located at `/tmp/flowforge/run_{stepRunId}` on the host, mapping to `/app/io` inside the container. It contains:
  - `script.py`: The user-supplied Python script.
  - `input.json`: The resolved input arguments passed to the step.
  - `output.json`: The output JSON written by the script, read back by the worker.
- **Hashed Virtualenv Cache**: Located at `/var/flowforge/cache/venvs/{venv_hash}` on the host, mapped as a read-only volume to the execution container. It caches compiled dependency folders generated by helper builder containers.

### 3. Cache / Pub-Sub (Azure Cache for Redis) — Ephemeral Event Bus
Redis holds **no durable state**. It acts strictly as an ephemeral, fire-and-forget channel.
- **State Change Broadcasts**: Channels named `flowforge:events:<channel>` push live step progress and console log lines from workers to the SSE Gateway.
- **Worker Heartbeats**: Key pattern `flowforge:worker:<worker_id>:heartbeat` tracking active worker nodes (TTL: 60 seconds).

---

## Auth and Access Model

### Identity Provider (Clerk)
User authentication is delegated entirely to Clerk.
- **JWT Authentication**: The React dashboard uses Clerk to issue short-lived JWTs, attached to the `Authorization: Bearer <token>` header of every API call.
- **Fastify Middleware**: The API validates incoming JWTs using the `@clerk/fastify` plugin, extracting the `userId` and user metadata.

### Roles and RBAC
User authorization is determined by Clerk **public metadata**:

```json
{ "role": "operator" } // or { "role": "viewer" }
```

| Role | Permissions |
|---|---|
| `operator` | Read and write: create, edit, trigger, retry, replay, and cancel workflows. |
| `viewer` | Read-only: view workflows, runs, real-time log streams, and metrics. |

### Access Control & Tenant Boundaries
- **MVP Boundary**: Single-tenant. All authenticated users share access to all workflows, runs, and logs.
- **Secret Management**: Decrypted credentials for database connections or APIs reside in memory inside the worker process only during execution. Handlers must redact secrets before writing output logs or payloads. Clerk private keys are stored in Azure Key Vault.

---

## AI & Background Task Models

FlowForge isolates background execution loops to prevent event-loop starvation and ensure distributed safety.

```
   ┌────────────────────────────────────────────────────────┐
   │                     WORKER CONCURRENCY                 │
   │                                                        │
   │   Queue Polling (SKIP LOCKED)                          │
   │        │                                               │
   │        ├─► Spawn Container (Non-blocking Promise)      │
   │        │     ├─► Execute Python / AI script            │
   │        │     └─► Clean up container/temp folders       │
   │        │                                               │
   │        └─► Parallel Lease Heartbeat (Interval)         │
   │              └─► RENEW lease in DB (Every 10s)         │
   └────────────────────────────────────────────────────────┘
```

### 1. Worker Execution & Container Sandbox
Each worker runs an asynchronous loop that claims and executes steps.
- **Polling**: Claims `QUEUED` step runs atomically using PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` and transitions them to `RUNNING`.
- **Async Sandbox Promise**: The container execution runs as an asynchronous, non-blocking Promise using the `dockerode` SDK. This allows the Node.js event loop to process other claims and updates.
- **Async Heartbeat Loop**: While the container runs (which can take minutes/hours), an independent heartbeat loop triggers every 10 seconds to renew the PostgreSQL lease (`lease_expires_at = NOW() + 30s`).
- **Cooperative Container Cancellation**: When a user cancels a run, the worker intercepts the `AbortSignal` (`ctx.signal.aborted`) and programmatically kills and removes the container and temp workspace.

### 2. Dependency Builder Container (Dynamic Caching)
To bypass expensive `pip install` commands on container startup, a cache builder process evaluates dependencies:
- **Hashing**: Computes a SHA-256 hash of the `requirements` array.
- **Cache Check**: If the directory `/var/flowforge/cache/venvs/{venv_hash}` does not exist, the worker spawns a temporary builder container:
  ```bash
  pip install --target=/cache/{venv_hash} -r requirements.txt
  ```
- **Read-Only Mounting**: Subsequent runs mount this directory as a read-only volume on the container's `PYTHONPATH`, resolving packages instantly.

### 3. AI Step Integration (`embedding-generator`)
- **Execution Model**: Standard TypeScript handler calling OpenAI or local API services.
- **Rate-Limiting & Backoff**: AI handlers execute inside the standard worker flow and handle API rate limits natively using retry policies (exponential backoff with jitter) configured in `workflow_steps`.

### 4. Scheduler (API Process)
- **Lease Sweeper**: Runs every 15 seconds. Scans for `RUNNING` step runs where `lease_expires_at < NOW()`. Re-queues expired jobs or routes them to the Dead-Letter Queue (DLQ) if max retries are exhausted.
- **Retry Promoter**: Runs every 5 seconds. Transition steps in the `RETRYING` state back to `QUEUED` once their backoff timer (`next_run_at <= NOW()`) expires.

---

## Invariants

These rules must never be violated anywhere in the codebase. They are correctness and security requirements.

### Data & State Invariants
1. **PostgreSQL is the single source of truth for workflow state.** Redis is exclusively a Pub/Sub event bus. No code path may write canonical workflow or step state to Redis.
2. **A worker must commit results using the fencing-token query.** Updates to a step run must verify `id = :step_run_id AND worker_id = :worker_id AND status = 'RUNNING' AND lease_expires_at > NOW()`. If 0 rows are updated, the lease was lost, and the worker must discard execution results.
3. **A step must never transition to `QUEUED` more than once per attempt group.** All `StepRun` rows must be pre-created in the `PENDING` state when the `WorkflowRun` is initialized. Step runs must not be created on-the-fly.
4. **Decrypted secrets must exist only in memory.** No credential, token, or decrypted secret may be saved to `step_logs`, `step_runs`, or `workflow_steps`. The logging layer must strip connection metadata matching `connection_refs` before persistence.
5. **Handlers must never update `step_runs` or `workflow_runs` directly.** Handlers must only return plain outputs or throw errors. The worker process alone manages step lifecycle updates.
6. **The Scheduler and Lease Sweeper must not execute handlers.** Their responsibility is strictly state transition updates (`RETRYING` → `QUEUED` and `RUNNING` → `QUEUED` / `DEAD_LETTERED`).
7. **DAG definitions must be validated before save.** Workflows containing cycles, unregistered handlers, unresolvable dependencies, or unreachable steps must be rejected immediately at the API boundary.
8. **Workers must never block the event loop with synchronous sleeps.** All retry delays must flow through `next_run_at` persisted in the database and evaluated by the Scheduler.

### Sandbox & Security Invariants
9. **Execution containers must be completely network-isolated.** The Docker container configuration must explicitly use `NetworkMode: 'none'`. Sandbox steps are strictly offline.
10. **Sandbox containers must execute under a non-root user.** Containers must be configured with `User: '1000:1000'` to prevent root-privilege container escapes on the host.
11. **Containers must have enforced resource limits.** Every execution container must set `Memory` (e.g. 512MB) and `NanoCpus` (e.g. 500000000) to prevent rogue processes from starving worker node resources.
12. **Container root filesystems must be mounted as read-only.** The container host configuration must set `ReadonlyRootfs: true`. Writable file operations must be restricted entirely to the bound `/app/io` workspace volume.
13. **Cache directories must be mounted as read-only.** Host virtualenv cache volumes mounted to `/var/flowforge/cache/venvs/*` must use the read-only mount option (`ro`) to prevent sandboxed python scripts from tampering with shared dependencies.
14. **Workspace cleanup must be guaranteed on step exit.** Regardless of success, failure, timeout, or cancellation/abort, the associated Docker container must be fully removed (`container.remove()`) and the temporary workspace directory on the host must be recursively deleted.

---

## Key Sequence: End-to-End Step Execution

The sequence below illustrates a full step execution cycle including the programmatic sandbox lifecycle.

```
POST /api/workflows/:id/runs
  └─ Engine: create workflow_run (PENDING → RUNNING)
  └─ Engine: create all step_runs in PENDING state
  └─ Engine: promote root steps (PENDING → QUEUED)

Worker poll loop (concurrently claims tasks):
  ├─ SELECT FOR UPDATE SKIP LOCKED → claim QUEUED step_run
  └─ UPDATE step_run: status=RUNNING, worker_id, lease_expires_at, attempt_count++
       │
       ├─ Parallel Promise Loop:
       │    └─ Start lease heartbeat interval (updates lease_expires_at in DB every 10s)
       │
       └─ Sandbox Execution (python-script handler):
            ├─ Create host workspace `/tmp/flowforge/run_{stepRunId}`
            ├─ Write `script.py` and `input.json`
            ├─ Check requirement virtualenv cache
            │    ├─ Cache Miss: Spawn builder container → run pip install → cache folder
            │    └─ Cache Hit: Mount cached virtualenv folder as read-only
            ├─ Spawn Docker container (network: none, user: 1000:1000, read-only rootfs)
            ├─ Attach container streams (stdout/stderr)
            │    ├─ Pipe plain lines to `step_logs` and Redis Pub/Sub (live console)
            │    └─ Parse `__PROGRESS__ <json>` lines to update step run progress percentage in DB
            ├─ Wait for container termination (or timeout / AbortSignal cancellation)
            │    ├─ If AbortSignal: Kill container → Remove container → Delete workspace folder
            │    └─ If Success: Read `output.json` from workspace
            └─ Container Exit & Cleanup:
                 ├─ Kill container (if running) & remove container
                 └─ Recursively delete workspace directory on host
                      │
                      └─ Fencing-Token Commit (worker verifies lease is still active):
                           │
                           ├─ SUCCESS:
                           │    └─ UPDATE step_run: status=SUCCEEDED, output_payload, progress=100
                           │    └─ Engine: promote downstream steps (PENDING → QUEUED)
                           │    └─ Publish step.succeeded event → Redis → SSE → Dashboard
                           │
                           └─ FAILURE (Crash / Timeout / Non-zero exit code):
                                ├─ attempt_count < max_attempts:
                                │    └─ UPDATE step_run: status=QUEUED (retry), next_run_at=future
                                │    └─ Publish step.retry event
                                └─ attempt_count >= max_attempts:
                                     └─ UPDATE step_run: status=DEAD_LETTERED, error_message
                                     └─ UPDATE workflow_run: status=FAILED
                                     └─ Publish step.failed event
```
