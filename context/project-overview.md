# FlowForge — Project Overview

> **Who this document is for**: Any developer (or AI coding agent) joining the project. Read this first.  
> After reading this document you should know: what FlowForge is, why it exists, what the key moving parts are, and what a successful MVP looks like.

---

## Table of Contents

1. [What Is FlowForge?](#1-what-is-flowforge)
2. [Why Does It Exist? (The Problem)](#2-why-does-it-exist-the-problem)
3. [High-Level Architecture (Plain English)](#3-high-level-architecture-plain-english)
4. [Goals](#4-goals)
5. [Core User Flow — Step by Step](#5-core-user-flow--step-by-step)
6. [Feature List](#6-feature-list)
7. [MVP Scope (In / Out)](#7-mvp-scope-in--out)
8. [Success Criteria](#8-success-criteria)
9. [Glossary of Key Terms](#9-glossary-of-key-terms)

---

## 1. What Is FlowForge?

FlowForge is a **distributed workflow orchestration platform**. In plain English: it lets you define a sequence of tasks (called a **workflow**) where each task can depend on the output of previous tasks, and then runs those tasks reliably across one or more background worker processes — even if a worker crashes mid-execution.

Think of it like **GitHub Actions** or **Apache Airflow**, but self-hosted, built on PostgreSQL as the job queue, and with first-class support for running arbitrary **Python scripts in sandboxed Docker containers**.

### What a "workflow" looks like

```
Workflow: "Process Customer Order"
├── Step A: validate_order       (TypeScript handler)
├── Step B: charge_payment       (TypeScript handler) — depends on A
├── Step C: run_ml_scoring       (Python script)      — depends on A
└── Step D: send_confirmation    (TypeScript handler) — depends on B and C
```

Steps B and C can run **in parallel** because they both only depend on A. Step D waits for both B and C to finish. This graph of dependencies is called a **Directed Acyclic Graph (DAG)** — directed because dependencies flow one way, acyclic because there can be no loops (a step cannot depend on itself or a later step).

---

## 2. Why Does It Exist? (The Problem)

Running background jobs reliably is deceptively hard. The naive approach — "just call a function in a background thread" — breaks down quickly:

| Problem | Naive approach breaks because... | FlowForge solution |
|---|---|---|
| Worker crashes mid-job | Work is lost silently | **Lease-based heartbeats** + automatic re-claim |
| Two workers claim the same job | Duplicate execution | **`SKIP LOCKED`** atomic claim in PostgreSQL |
| A step needs the output of another | You write ad-hoc glue code | **DAG dependency graph** with automatic promotion |
| Running untrusted user code | Security risk | **Docker sandbox**, no network, no root, read-only FS |
| `pip install` on every run is slow | Cold start latency | **Hashed virtualenv cache** on host filesystem |
| Operator can't see what's happening | Black box | **Real-time SSE log streaming** to dashboard |
| A step fails after many retries | Needs manual intervention | **Dead-Letter Queue (DLQ)** + replay controls |

---

## 3. High-Level Architecture (Plain English)

Below is the complete data flow from "operator clicks trigger" to "step output saved to DB". Read this alongside `architecture.md` which has the formal boundaries and stack table.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLOWFORGE — DATA FLOW                        │
│                                                                     │
│  [Operator Browser]                                                 │
│       │  ① Clicks "Run Workflow"                                    │
│       ▼                                                             │
│  [React Dashboard]  ──── Clerk JWT ────►  [Fastify API Server]      │
│       │                                         │                   │
│       │  ② GET /api/runs/:id (full state)       │  ③ Engine creates │
│       │  ③ SSE stream for live events           │     WorkflowRun + │
│       │                                         │     StepRun rows  │
│       │                                         ▼                   │
│       │                               [PostgreSQL — Source of Truth]│
│       │                                         │                   │
│       │                               ④ Worker polls QUEUED rows    │
│       │                                         │                   │
│       │                                    [Worker Process]         │
│       │                                         │                   │
│       │                               ⑤ Spawns Docker container     │
│       │                               ⑥ Pipes logs → step_logs +   │
│       │                                  Redis Pub/Sub              │
│       │                                         │                   │
│       │◄─── SSE (live log lines, %) ────  [Redis Pub/Sub]           │
│       │                                         │                   │
│       │                               ⑦ Container exits → fencing  │
│       │                                  token commit to PostgreSQL │
│       │                               ⑧ Engine promotes next steps  │
│       │                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### The five processes that run

| Process | Where it runs | What it does |
|---|---|---|
| **API Server** | `packages/api/` (Node.js) | Handles all HTTP requests from the dashboard and external clients |
| **Workflow Engine** | Inside the API process | Creates run records, validates DAGs, promotes dependent steps |
| **Scheduler** | Inside the API process (timer loop) | Moves delayed-retry steps back to `QUEUED` when their timer expires |
| **Worker** (N copies) | `packages/worker/` (separate Node.js process) | Polls PostgreSQL, claims jobs, runs handlers/containers, commits results |
| **Dashboard** | `packages/dashboard/` (React) | Real-time operator UI |

---

## 4. Goals

Each goal below has a plain-English explanation so the intent is unambiguous.

### 4.1 Atomic Job Claiming
**What**: No two workers should ever execute the same step at the same time.  
**How**: PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` — when a worker claims a row, it locks it. Other workers skip locked rows and claim different ones.  
**Why it matters**: Without this, two workers could both start the same payment step, charging a customer twice.

### 4.2 Secure Execution Isolation
**What**: When a user provides a Python script, that script must not be able to damage the host machine, access other users' data, or make network calls.  
**How**: The script runs in a Docker container with: no network interface, a read-only filesystem, a non-root user (`1000:1000`), memory and CPU caps, and an optional gVisor kernel isolation layer.  
**Why it matters**: Without isolation, a malicious script could read secrets from `/etc/`, call external APIs, or fill up disk.

### 4.3 Fault-Tolerant Retries
**What**: If a step fails (container crash, timeout, non-zero exit), retry it automatically with increasing delays.  
**How**: On failure, set `status = RETRYING` and `next_run_at = NOW() + backoff_delay`. The Scheduler re-promotes it to `QUEUED` once the timer expires. After `max_attempts` failures, move to `DEAD_LETTERED`.  
**Why it matters**: Transient errors (network hiccup, out-of-memory spike) should not permanently fail a workflow.

### 4.4 Execution Idempotency
**What**: If a step is accidentally re-claimed and re-executed (e.g., after a lease loss), the second execution must not double-write results.  
**How**: Each step run has a unique `idempotency_key = workflow_run_id + step_id + attempt_group`. The fencing-token commit query also checks that the committing worker still owns the lease.  
**Why it matters**: Prevents duplicate `step_logs` entries and incorrect `output_payload` overwrites.

### 4.5 Lease-Based Recovery
**What**: If a worker process crashes while running a step (e.g., OOM kill, power loss), that step must automatically be picked up by another worker.  
**How**: When a worker claims a step, it sets `lease_expires_at = NOW() + 30s`. An async heartbeat renews this every 10 seconds. A background **Lease Sweeper** scans for steps where `lease_expires_at < NOW()` (meaning the worker stopped heartbeating) and re-queues them.  
**Why it matters**: Without leases, a crashed worker would leave steps stuck in `RUNNING` forever.

### 4.6 Dynamic Dependency Caching
**What**: Python scripts can declare pip packages. Installing them fresh on every run is slow (30–120 seconds).  
**How**: Hash the `requirements` array (SHA-256). If `/var/flowforge/cache/venvs/{hash}` exists, mount it read-only and reuse. If not, spawn a builder container, run `pip install --target /cache/{hash}`, then mount.  
**Why it matters**: Warm cache runs start in under 5 seconds instead of minutes.

### 4.7 Real-Time Telemetry
**What**: Operators should see log lines appear in the dashboard as the script prints them, not only after the step finishes.  
**How**: Worker attaches to the container's stdout/stderr stream. Each line is written to `step_logs` in PostgreSQL and published to Redis Pub/Sub. The SSE Gateway (`GET /api/events/stream`) subscribes and pushes to the browser.  
**Why it matters**: Without real-time logs, debugging a failing step requires waiting for it to finish or SSH-ing into the worker.

### 4.8 Cooperative Lifecycle Control
**What**: Operators can cancel a running workflow, which must kill the Docker container immediately.  
**How**: The API marks the `WorkflowRun` as `CANCELLED`. The worker monitors `ctx.signal.aborted`. When the signal fires, it calls `container.kill()` then `container.remove()`, deletes the temp workspace, and commits `status = CANCELLED`.  
**Why it matters**: Without cooperative cancellation, a cancelled run's container would keep running (consuming CPU/RAM) until it finishes naturally.

### 4.9 DAG Integrity Validation
**What**: A workflow with a cycle (Step A depends on Step B depends on Step A) or a reference to a handler that doesn't exist must be rejected before saving.  
**How**: The Engine runs topological sort on the DAG at save time. It also checks each `handler_name` against the handler registry. Failures return a `422 Unprocessable Entity` with field-level detail.  
**Why it matters**: A cyclic DAG would cause the Engine to spin forever promoting steps that can never complete.

### 4.10 Horizontal Scalability
**What**: Adding more workers should increase throughput linearly with no coordination code changes.  
**How**: All workers independently poll the same PostgreSQL table. `SKIP LOCKED` ensures they claim different rows. No shared in-memory state exists between workers beyond the DB and Redis.  
**Why it matters**: This is the core scalability mechanism — `docker compose up --scale worker=10` is the only change needed.

---

## 5. Core User Flow — Step by Step

This is the full journey from dashboard interaction to completed step. Read it carefully — every decision here maps to a specific piece of architecture.

### Step 1 — Access the Dashboard
The operator opens the FlowForge React dashboard. Clerk handles authentication. The dashboard fetches the current list of workflows and active runs over REST and then opens an SSE connection to receive live updates.

### Step 2 — Define a Workflow
The operator creates a new workflow with named steps. For a Python script step they provide:
- The Python source code (stored in `workflow_steps.input_config` JSONB field as `{ "script": "...", "requirements": ["pandas==2.0"] }`)
- Resource limits (CPU, RAM)
- Retry policy (max attempts, base delay in milliseconds)
- A step key (unique identifier within the workflow)

### Step 3 — Link Dependencies
The operator connects step outputs to the inputs of downstream steps. The UI sends the dependency edges. On save, the API calls the Engine to validate the DAG — detecting cycles, missing handlers, and bad input mappings.

### Step 4 — Trigger a Workflow Run
The operator clicks "Run" (or an external system calls `POST /api/workflows/:id/runs`). The Engine:
1. Creates one `WorkflowRun` row in `PENDING` → `RUNNING` state.
2. Creates one `StepRun` row per step, **all in `PENDING` state** (not `QUEUED` yet).
3. Identifies root steps (steps with no dependencies) and atomically transitions them to `QUEUED`.

> **Why pre-create all `StepRun` rows?**  
> If they were created on-the-fly, a worker promoting a step could race with another worker creating that same step's row, causing duplicates or lost transitions. Pre-creation eliminates that race entirely.

### Step 5 — Worker Claims a Task
A worker process (polling every few seconds) executes:
```sql
SELECT * FROM step_runs
WHERE status = 'QUEUED'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```
It then immediately updates the claimed row:
```sql
UPDATE step_runs
SET status = 'RUNNING',
    worker_id = :my_worker_id,
    lease_expires_at = NOW() + INTERVAL '30 seconds',
    attempt_count = attempt_count + 1
WHERE id = :step_run_id;
```

### Step 6 — Prepare the Sandbox Workspace
For a `python-script` step, the worker:
1. Creates a temp directory: `/tmp/flowforge/run_{stepRunId}/`
2. Writes `script.py` (the user's code)
3. Writes `input.json` (the resolved input arguments)
4. Checks if `/var/flowforge/cache/venvs/{sha256(requirements)}` exists on the host.
   - **Cache hit**: proceeds immediately.
   - **Cache miss**: spawns a builder container → runs `pip install --target /cache/{hash} -r requirements.txt` → directory now exists.

### Step 7 — Execute the Sandboxed Script
The worker calls `dockerode` to create and start a container with:
- **Image**: `python:3.10-slim`
- **Network**: `none` (completely offline)
- **User**: `1000:1000` (non-root)
- **Read-only rootfs**: `true`
- **Memory limit**: `512MB`
- **CPU quota**: `0.5` cores (`NanoCpus: 500000000`)
- **Volume mounts**:
  - `/tmp/flowforge/run_{id}` → `/app/io` (writable — script reads input, writes output here)
  - `/var/flowforge/cache/venvs/{hash}` → `/app/venv` (read-only)
- **Entrypoint**: `python /app/io/script.py`
- **PYTHONPATH**: `/app/venv`

### Step 8 — Real-Time Telemetry and Heartbeats
While the container runs, the worker does two things simultaneously (non-blocking Promises):

**Stream processing**: Reads stdout/stderr line by line:
- Regular lines → insert into `step_logs` + publish to `flowforge:events:step:{id}` on Redis.
- Lines matching `__PROGRESS__ {"percent": 75}` → update `step_runs.progress = 75` in PostgreSQL.

**Heartbeat loop**: Every 10 seconds, execute:
```sql
UPDATE step_runs
SET lease_expires_at = NOW() + INTERVAL '30 seconds'
WHERE id = :step_run_id AND worker_id = :my_worker_id;
```

### Step 9 — Handle Step Completion

**On Success**:
1. Script writes results to `/app/io/output.json`.
2. Worker reads `output.json`.
3. Worker executes the fencing-token commit:
   ```sql
   UPDATE step_runs
   SET status = 'SUCCEEDED', output_payload = :output, progress = 100
   WHERE id = :step_run_id
     AND worker_id = :my_worker_id
     AND status = 'RUNNING'
     AND lease_expires_at > NOW();
   -- If 0 rows updated: lease was lost. Discard result.
   ```
4. Engine identifies downstream steps whose all dependencies are now `SUCCEEDED` → promotes them to `QUEUED`.
5. Publishes `step.succeeded` event to Redis.

**On Failure** (non-zero exit, timeout, OOM, crash):
- If `attempt_count < max_attempts`:
  - Set `status = RETRYING`, `next_run_at = NOW() + backoff_delay`
- If `attempt_count >= max_attempts`:
  - Set `status = DEAD_LETTERED`
  - Set parent `WorkflowRun.status = FAILED`
  - Publish `step.failed` event.

**Always** (success, failure, or cancellation):
- Call `container.kill()` then `container.remove()`
- Recursively delete `/tmp/flowforge/run_{stepRunId}/`

### Step 10 — Manage Run Lifecycle
- **Cancel**: Operator clicks "Cancel" → API sets `WorkflowRun.status = CANCELLING` → Worker detects `ctx.signal.aborted` → kills container → commits `CANCELLED`.
- **Replay**: Operator selects a failed `WorkflowRun` and chooses a replay start step. The Engine creates a new `WorkflowRun` with `original_run_id` pointing to the failed run. `SUCCEEDED` steps before the start point copy their `output_payload` forward; the replay start step and all downstream steps get fresh `StepRun` rows.

---

## 6. Feature List

### 6.1 Workflow Definition & Validation
- Define workflows as named, versioned DAGs of typed steps.
- Set retry policies (`maxAttempts`, `baseDelayMs`) and execution timeouts per step.
- Validate DAG properties (no cycles, valid step key mappings, handler existence, schema conformance) before persistence.
- Store Python script code and requirements list in `workflow_steps.input_config` JSONB — no separate file storage needed for MVP.

### 6.2 PostgreSQL Job Queue & Orchestration
- Atomic job claiming with `SELECT ... FOR UPDATE SKIP LOCKED`.
- Pre-creation of all `StepRun` records in `PENDING` state when a `WorkflowRun` starts.
- Atomic downstream step promotion upon parent success.
- Idempotency keys per step attempt to prevent duplicate writes.

### 6.3 Sandboxed Python Execution
- Programmatic Docker container management via `dockerode`.
- Container hardening: network-isolated, read-only root filesystem, non-root user, memory + CPU limits.
- Optional gVisor (`runsc`) for kernel-level isolation.
- File-based I/O between host worker and container via mounted volumes (`input.json`, `output.json`, `script.py`).

### 6.4 Real-Time Logs & Progress
- Non-blocking stdout/stderr stream tailing.
- Line-by-line log writing to PostgreSQL `step_logs`.
- Redis Pub/Sub broadcast for real-time UI streaming.
- `__PROGRESS__ {"percent": N}` sentinel lines update `step_runs.progress` in real time.

### 6.5 Dynamic Dependency Caching
- SHA-256 of `requirements` array used as cache key.
- Builder container spawned on cache miss to run `pip install --target /cache/{hash}`.
- Cache mounted read-only on subsequent runs.

### 6.6 Fail-Safety & Cooperative Lifecycle
- Lease-based heartbeats preventing stale worker retention.
- Background lease sweeper re-queuing expired jobs.
- Fencing-token commit protecting against stale writes.
- Cooperative cancellation via `AbortSignal` and `container.kill()`.
- DLQ for exhausted retries with replay support.

### 6.7 Real-Time Dashboard
- ReactFlow DAG view showing per-step execution state (color-coded).
- Live console log viewer streamed via SSE.
- Operator tools: retry single step, cancel run, replay from a node.
- Worker health widget showing live heartbeat status.
- Queue depth and DLQ depth metrics.

---

## 7. MVP Scope (In / Out)

### In Scope — Build This
| Area | What exactly |
|---|---|
| Programmatic Docker management | Lifecycle via `dockerode`: `create`, `start`, `wait`, `kill`, `remove` |
| Volume-based I/O IPC | `script.py`, `input.json`, `output.json` passed via mounted host directory |
| Sandbox hardening | `none` network, read-only rootfs, user `1000:1000`, 512MB RAM, 0.5 CPU |
| Virtualenv caching | SHA-256 hash → builder container → read-only mount |
| Lease heartbeats | Async loop renewing `lease_expires_at` every 10s during container run |
| Log streaming | Non-blocking stdout → `step_logs` + Redis Pub/Sub |
| Progress IPC | Parse `__PROGRESS__` lines → update `step_runs.progress` in DB |
| Cooperative cancellation | `AbortSignal` → `container.kill()` + `container.remove()` + workspace delete |
| Core DAG engine | Queue, backoff retries, dead-lettering, replay |

### Out of Scope — Do Not Build
| What | Why deferred |
|---|---|
| Languages other than Python 3 | Increases sandbox complexity; not needed for MVP |
| Network access inside containers | Security — all scripts must be offline |
| Changing resource limits while running | Complex and unnecessary for MVP |
| Multi-host Docker (K8s, Swarm) | All containers run on the same host as the worker daemon |
| Web-based code editor in dashboard | Nice-to-have; plain textarea is sufficient for MVP |
| Virtualenv garbage collection | Manual eviction is acceptable for MVP |
| Interactive terminals into containers | Security risk; not needed for MVP |

---

## 8. Success Criteria

These are the concrete, testable outcomes that define a working MVP. Every criterion must pass before MVP is considered complete.

| # | Criterion | How to verify |
|---|---|---|
| 1 | **DAG Integrity** | Create a workflow with a cycle → expect `422` with `"Cyclic dependency detected"` error |
| 2 | **Topological Ordering** | Step D (depends on B and C) must only enter `QUEUED` after both B and C are `SUCCEEDED` |
| 3 | **Network Block** | Inside a Python script, `import urllib.request; urllib.request.urlopen("http://google.com")` must raise `OSError` |
| 4 | **Resource Limits** | A script running `while True: pass` must be killed by the worker timeout and the step marked `FAILED` |
| 5 | **Live Console Logs** | A `print("hello")` in a script must appear in the dashboard log viewer within 3 seconds of execution |
| 6 | **Progress Bars** | `print("__PROGRESS__", json.dumps({"percent": 75}))` must update the ReactFlow node progress bar in real time |
| 7 | **Non-Blocking Heartbeat** | A 5-minute container run must renew its lease every 10s and not block the poll loop for other QUEUED steps |
| 8 | **Fast Cancellation** | Clicking "Cancel" must kill the container, delete the workspace, and update state within 2 seconds |
| 9 | **Cache Reuse** | A second run with the same `requirements` list must skip `pip install` and start in under 5 seconds |
| 10 | **One-Command Boot** | `docker compose up` must bring up API, workers, DB, and Redis with no manual steps, and run a sample workflow end-to-end |

---

## 9. Glossary of Key Terms

| Term | Definition |
|---|---|
| **DAG** | Directed Acyclic Graph — a graph of tasks where edges represent "depends on" and there are no cycles |
| **WorkflowRun** | A single execution instance of a workflow definition. Has its own status and input payload |
| **StepRun** | A single execution attempt of one step within a `WorkflowRun`. Multiple `StepRun`s can exist for the same step (one per retry attempt group) |
| **Handler** | A named TypeScript function registered in the Handler Registry that implements a step's logic |
| **`python-script` handler** | A special handler that spins up a Docker container to execute user-supplied Python code |
| **Fencing token** | A conditional `UPDATE` query that only succeeds if the worker still owns the lease. Prevents stale workers from writing results |
| **SKIP LOCKED** | A PostgreSQL clause that causes a `SELECT FOR UPDATE` to skip rows already locked by another transaction, enabling safe concurrent job claiming |
| **Lease** | A time-bounded ownership claim on a `StepRun`. A worker holds the lease while running; losing it means the Lease Sweeper can re-queue the step |
| **Lease Sweeper** | A background timer that scans for `RUNNING` steps where `lease_expires_at < NOW()` and re-queues them |
| **DLQ** | Dead-Letter Queue — the `DEAD_LETTERED` status given to steps that have exhausted all retry attempts |
| **Replay** | Creating a new `WorkflowRun` that reuses the outputs of already-`SUCCEEDED` steps and re-executes only the failed portion |
| **SSE** | Server-Sent Events — a browser protocol for one-directional server-to-client push events over HTTP |
| **Virtualenv hash** | SHA-256 of the `requirements` array, used as a directory name on the host to cache installed pip packages |
| **Builder container** | A temporary Docker container spawned only to run `pip install` and populate the virtualenv cache |
| **gVisor / runsc** | A Google-developed kernel-level sandbox for containers, providing deeper isolation than standard Docker cgroups |
| **`input_config` JSONB** | The PostgreSQL column in `workflow_steps` that stores the Python script source code and requirements list as a JSON object |
| **`connection_refs`** | Named references to external credentials (database passwords, API keys) stored encrypted in PostgreSQL, referenced by handlers |
