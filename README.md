# 🛠️ FlowForge

### **Distributed Workflow Orchestration & Background Processing Platform**

> A production-grade, horizontally scalable background processing and DAG orchestration engine designed for developers and operators who need reliable, fault-tolerant asynchronous execution.

---

```
   ⚡ PostgreSQL queue (`SKIP LOCKED`)  |  ⛓️ DAG-based Dependency Routing
   🧬 Horizontally Scalable Workers    |  📡 Real-Time SSE Gateway & Dashboard
   🛡️ Fencing Token Lease Recovery    |  🔐 Clerk JWT Auth & RBAC
```

---

## 📌 Table of Contents
1. [Platform Overview](#-platform-overview)
2. [Key Architecture & System Flow](#-key-architecture--system-flow)
3. [Core Technical Features](#-core-technical-features)
4. [System Boundaries & Folder Structure](#-system-boundaries--folder-structure)
5. [Database Schema & Invariants](#-database-schema--invariants)
6. [Fault Tolerance & Distributed Safeguards](#-fault-tolerance--distributed-safeguards)
7. [Observability & Dashboard](#-observability--dashboard)
8. [Developer Quick Start](#-developer-quick-start)
9. [Interview Cheat Sheet (System Design Strengths)](#-interview-cheat-sheet-system-design-strengths)
10. [Application Building Context System](#-application-building-context-system)

---

## 📖 Platform Overview

**FlowForge** bridges the gap between simple task queues (like BullMQ or Celery) and heavy enterprise workflow systems (like Temporal or Apache Airflow). Built as a modular monolith in Node.js and TypeScript, it allows engineers to define complex, multi-step workflows as **Directed Acyclic Graphs (DAGs)**.

Every step in the workflow executes on horizontally scalable background workers. The system coordinates execution order via a PostgreSQL-backed queue utilizing `SKIP LOCKED` for atomic, concurrency-safe job claiming. Fault recovery is built-in with time-bounded leases, a background lease-sweeper daemon, and fencing tokens to eliminate "zombie worker" data corruption. Real-time operational visibility is powered by an SSE (Server-Sent Events) Gateway backed by Redis Pub/Sub, feeding a live ReactFlow-based dashboard.

---

## 🏗️ Key Architecture & System Flow

FlowForge is architected as a modular monolith, separating ingestion, scheduling, execution, and real-time state delivery.

```
                  ┌──────────────────────────────────────────────┐
                  │              Dashboard (React UI)            │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTPS / SSE
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │          Fastify REST API & Gateway          │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
     ┌───────────────────────────────────────────────────────────────────────┐
     │                       Workflow Orchestration                          │
     │  ┌───────────────────────┐                 ┌───────────────────────┐  │
     │  │    Workflow Engine    │                 │   Scheduler Daemon    │  │
     │  └──────────┬────────────┘                 └──────────┬────────────┘  │
     └─────────────┼─────────────────────────────────────────┼───────────────┘
                   │                                         │
                   ▼                                         ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────────┐
│     PostgreSQL 16 (Durable DB)       │   │    Redis Pub/Sub (Event Bus)    │
│  - workflows     - step_runs         │   │  - Live status transitions      │
│  - step_deps     - step_logs         │   │  - Worker heartbeat indicators  │
└──────────────────┬───────────────────┘   └─────────────────┬───────────────┘
                   │                                         │
                   ▼ (SKIP LOCKED Claim)                     │ (SSE delta pushes)
┌──────────────────────────────────────┐                     │
│          Worker Pool (1..N)          │◄────────────────────┘
│  - Claims QUEUED StepRuns            │
│  - Invokes Handlers via Registry     │
│  - Heartbeats Lease to DB            │
└──────────────────────────────────────┘
```

### End-to-End Step Execution Sequence

Below is the execution flow from enqueuing a workflow run to real-time UI synchronization:

```mermaid
sequenceDiagram
    autonumber
    actor User as Operator / Dashboard
    participant API as Fastify REST API
    participant DB as PostgreSQL 16
    participant Engine as Workflow Engine
    participant Workers as Distributed Workers
    participant Redis as Redis Pub/Sub
    participant SSE as SSE Gateway

    User->>API: 1. POST /api/workflows/:id/runs (JSON Input)
    API->>API: 2. Validate DAG (DFS Cycle Detection, Check Registry)
    API->>DB: 3. Pre-create WorkflowRun & StepRuns (Root = QUEUED, Deps = PENDING)
    Note over DB: Atomic transaction protects against duplicate runs
    API-->>User: Return WorkflowRun ID (202 Accepted)

    loop Concurrent Worker Polling
        Workers->>DB: 4. Claim StepRun (SELECT FOR UPDATE SKIP LOCKED)
        activate DB
        DB-->>Workers: Claimed StepRun (status -> RUNNING, lease_expires_at updated)
        deactivate DB
    end

    Workers->>Workers: 5. Execute mapped handler (e.g. embedding-generator)
    Workers->>DB: 6. Periodically heartbeat lease (every 10 seconds)

    alt Execution Succeeded
        Workers->>DB: 7. Commit result (fencing check: worker_id matched & lease valid)
        activate DB
        DB-->>Workers: Commit Successful
        deactivate DB
        Engine->>DB: 8. Transition child StepRuns (PENDING -> QUEUED)
    else Execution Failed
        Workers->>DB: 7. Commit failure (set status -> QUEUED for retry with backoff, or DEAD_LETTERED)
    end

    Workers->>Redis: 9. Publish event (step-succeeded / step-failed)
    Redis->>SSE: 10. Forward event to active subscriptions
    SSE->>User: 11. Pushes delta update to update live graph UI
```

---

## ⚡ Core Technical Features

### 1. Concurrency-Safe Queueing (`SKIP LOCKED`)
Traditional SQL polling suffers from race conditions and lock contention under load. FlowForge uses a PostgreSQL index-backed queue powered by:
```sql
SELECT id FROM step_runs
WHERE status = 'QUEUED' AND next_run_at <= NOW()
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```
This enables hundreds of concurrent worker processes to query the exact same table simultaneously. Each worker secures a unique, transaction-locked job instantly without waiting for others.

### 2. Upfront Step Pre-Creation
To prevent the "concurrent parent completion" race condition (where two parent steps finish at the exact same millisecond and attempt to concurrently create the next child, executing it twice), FlowForge pre-creates **all** `StepRun` rows in `PENDING` state during run initialization. A unique constraint on `(workflow_run_id, step_id)` guarantees a step can never be duplicated.

### 3. Fencing Tokens & Crash Recovery
If a worker crashes mid-execution, its lease expires. The background **Lease Sweeper** identifies this and safely transitions the step back to `QUEUED`. To prevent "zombie workers" (which resume after a network split or process freeze) from overwriting fresh data, workers commit results using a fencing query:
```sql
UPDATE step_runs SET status = 'SUCCEEDED', output_payload = :output
WHERE id = :step_run_id AND worker_id = :worker_id AND status = 'RUNNING' AND lease_expires_at > NOW();
```
If `0` rows are updated, the worker lost its lease and discards its stale results safely.

### 4. Exponential Backoff with Jitter
Failed steps schedule retries using an exponential backoff curve with randomized jitter:
$$\text{delay} = \text{baseDelayMs} \times 2^{\text{attempt} - 1} + \text{randomJitter}$$
Retries are persisted via the `next_run_at` field in PostgreSQL. The Scheduler promotes these due runs without workers ever sleeping in-memory.

---

## 📂 System Boundaries & Folder Structure

FlowForge is constructed around highly disciplined system boundaries. Modules communicate only through declared TypeScript interfaces, ensuring the codebase can easily scale into microservices in V2.

```
flowforge/
├── context/                 # Developer context files (architecture, rules, etc.)
├── docs/                    # Architectural diagrams and SDE Beginner Guides
├── packages/
│   ├── api/                 # Fastify REST endpoints, Clerk JWT Auth middleware, SSE Gateway
│   ├── engine/              # DAG orchestrator, run initializer, dependency transitions
│   ├── scheduler/           # Timer loop promoting delayed retries & cron triggers
│   ├── worker/              # Worker poll loop, lease heartbeat generator, handler dispatcher
│   ├── handlers/            # Out-of-the-box system handlers (http, email, db ingestion, LLM embeddings)
│   ├── queue/               # Concurrency-safe SQL queries, lease sweeps, and claimed logic
│   ├── db/                  # PostgreSQL connection pool, schema, migrations
│   ├── events/              # Redis Pub/Sub events client and channel helpers
│   ├── dashboard/           # Live React + ReactFlow Operator monitoring dashboard
│   └── shared/              # Standard TypeScript types and shared interfaces
├── AGENTS.md                # Entry point explaining context file reads for AI models
└── docker-compose.yml       # Production-mimicked local composition
```

---

## 💾 Database Schema & Invariants

PostgreSQL is the **absolute source of truth**. Redis contains zero persistent state. If Redis crashes, the platform loses no operational data; the dashboard seamlessly resynchronizes upon full page load.

### Schema Blueprint

* **`workflows`**: Defines named, versioned DAG templates.
* **`workflow_steps`**: Configures individual steps, including retry policies, timeouts, and inputs.
* **`step_dependencies`**: Represents DAG edges to form clean step ordering.
* **`workflow_runs`**: Stores execution status, input payloads, and original run lineage (for replays).
* **`step_runs`**: Represents the concrete job queue, mapping status, priorities, lease timeouts, retry attempts, worker IDs, and output payloads.
* **`step_logs`**: Searchable structured JSON logs associated with individual steps (with automatic secret redaction).

### Primary System Invariants (Strict Core Rules)

1. **PostgreSQL is the Sole Source of Truth**: No state defining execution progress resides permanently outside PostgreSQL.
2. **Lease Fencing Commit Requirement**: Workers MUST verify their `worker_id` and active `lease_expires_at > NOW()` during output commit.
3. **No On-The-Fly Step Run Insertion**: All `StepRun` entries are initialized during the workflow start transaction. No downstream worker inserts `StepRun` rows.
4. **No Direct State Manipulation by Handlers**: Handlers must only return JSON outputs or throw exceptions; database mutations to the `step_runs` table are owned exclusively by the Worker process.
5. **No Active Thread In-Memory Sleep for Retries**: Retries must always flow through PostgreSQL `next_run_at` timestamps promoted by the Scheduler loop.

---

## 🛡️ Fault Tolerance & Distributed Safeguards

| Failure Case | Impact Without Guards | FlowForge Safeguard |
|---|---|---|
| **Worker Process Crash** | Job hangs in `RUNNING` forever. | **Lease Sweeper Daemon**: Periodically scans for expired leases and marks them `QUEUED` or `DEAD_LETTERED`. |
| **Worker Frozen (e.g. JVM GC split)** | Duplicate writes from two workers processing the same task. | **Fencing Tokens**: Update query checks `lease_expires_at > NOW() AND worker_id = :id` to reject stale writes. |
| **Simultaneous Parent Step Completions** | Downstream step enqueued/created multiple times. | **Upfront Pre-creation + Unique SQL constraint**: Conditional single update query modifies `PENDING` states atomically. |
| **API Server Reconnect** | UI displays frozen, stale state. | **Hybrid Sync Pattern**: UI pulls full state on connection start, then merges real-time Redis Pub/Sub event updates. |

---

## 📊 Observability & Dashboard

FlowForge prioritizes operational visibility. It includes structured logging and direct metrics exports:

* **Structured Logging**: Built with `Pino` to emit JSON logs containing the `workflow_run_id`, `step_run_id`, and `worker_id`. Connection credentials and secure parameters are automatically redacted before logs are written to `step_logs`.
* **Prometheus Metrics**: Exposes custom metrics:
  * `flowforge_jobs_total`: Count of processed step runs by status.
  * `flowforge_queue_latency_seconds`: Latency from `QUEUED` state to execution start.
  * `flowforge_worker_active`: Real-time utilization count of the worker pool.
  * `flowforge_retry_total`: Count of triggered backoff retries.
  * `flowforge_dlq_depth`: Depth count of dead-lettered steps.
* **Live Dashboard**: A responsive React SPA using ReactFlow to visualize the active execution graph. Timelines, status colors, error stack traces, and operator controls (retry step, replay run, cancel run) are available.

---

## 🚀 Developer Quick Start

### Prerequisites
* **Node.js**: v18+ (with npm)
* **Docker & Docker Compose**

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in necessary fields:
```ini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flowforge?schema=public
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
ENCRYPTION_KEY=your-32-byte-hex-encryption-key-for-secrets
```

### 3. Launch Local Environment (Single Command)
Deploy PostgreSQL, Redis, Prometheus, Grafana, API gateway, and 3 horizontally scaled background workers using:
```bash
docker compose up --scale worker=3 -d
```

### 4. Run Migrations & Seed Handlers
```bash
npm run db:migrate
npm run db:seed
```

---

## 🎯 Interview Cheat Sheet (System Design Strengths)

When presenting FlowForge in technical system design or portfolio reviews, highlight these high-level architectural decisions:

* **Why PostgreSQL SKIP LOCKED over Kafka/RabbitMQ?**
  * *Answer*: Eliminates dual-state synchronization issues. In a high-integrity platform, writing to a database and enqueuing in a broker must happen atomically. Doing both in PostgreSQL via ACID transactions simplifies operations, removes complex Outbox patterns, and scales reliably to thousands of executions per second.
* **Why SSE over WebSockets?**
  * *Answer*: One-way streaming simplicity. The dashboard only monitors server state and doesn't publish messages back to the server. SSE operates natively over standard HTTP/S, passes easily through firewalls, and provides auto-reconnection out of the box.
* **What guarantees At-Least-Once delivery?**
  * *Answer*: A robust lease heartbeat system. When a worker claims a step, it receives a 30-second lease. If it fails to update the lease (e.g. process termination), the sweeper returns the job to `QUEUED`.
* **How are side effects guarded in handlers?**
  * *Answer*: Every step receives a unique `idempotency_key = workflow_run_id + step_id + attempt_group`. Handlers check this key in the target store (e.g., checking if an email or webhook transaction has already logged that key) before execution.

---

## 🧬 Application Building Context System

FlowForge uses the **Six-File Context System** for AI-driven collaborative development. This structure guides developers and AI systems through consistent implementation rules, preserving patterns and architectural integrity across coding sessions.

* 💡 **[Project Overview](context/project-overview.md)** — Core scope, success metrics, and user flows.
* 🏗️ **[Architecture](context/architecture.md)** — Core design decisions, system invariants, and stack maps.
* 🎨 **[UI Context](context/ui-context.md)** — Aesthetics, HSL color tokens, typography, and ReactFlow conventions.
* 📜 **[Code Standards](context/code-standards.md)** — API formatting rules, TypeScript conventions, and nesting rules.
* 🤖 **[AI Workflow Rules](context/ai-workflow-rules.md)** — Scoping guidelines, step-splitting rules, and review checklists.
* 📈 **[Progress Tracker](context/progress-tracker.md)** — The live state log representing current development phase goals and completed units.

---
*FlowForge is maintained with ❤️ for modern backend systems portfolio showcases.*
