# FlowForge

## Overview

FlowForge is a distributed workflow orchestration and background processing platform built for developers and operators who need reliable asynchronous execution beyond a simple task queue. It lets users define multi-step workflows as directed acyclic graphs (DAGs), enqueue workflow runs through a REST API, and execute each step on horizontally scalable background workers backed by a PostgreSQL queue. Every step maps to a registered handler — such as `blob-to-postgres`, `http-request`, or `embedding-generator` — and the platform automatically manages dependency resolution, at-least-once delivery, exponential-backoff retries, dead-letter queueing, lease-based crash recovery, and real-time dashboard visibility, so operators can observe, diagnose, and replay failures without manual intervention.

---

## Goals

1. Execute multi-step workflows reliably across distributed workers using PostgreSQL `SKIP LOCKED` for atomic job claiming and at-least-once delivery semantics.
2. Recover automatically from transient failures using exponential backoff with randomized jitter, configurable per-step retry limits, and a dead-letter queue for exhausted retries.
3. Prevent duplicate execution by generating per-step idempotency keys (`workflow_run_id + step_id + attempt_group`) and checking a completion table before executing a claimed step.
4. Reclaim crashed-worker jobs using time-bounded leases and a background lease sweeper that re-queues stale `RUNNING` steps whose `lease_expire` has passed.
5. Provide real-time operational visibility through a Server-Sent Events (SSE) gateway backed by Redis Pub/Sub, so dashboard state reflects worker activity within seconds of each event.
6. Allow operators to replay failed workflow runs from a chosen step, preserving the original output payloads of already-succeeded steps and creating a new `WorkflowRun` linked to the original via `original_run_id`.
7. Validate workflow DAG definitions at save time — checking for cycles, unresolvable dependencies, unregistered handlers, and policy violations — so invalid workflows are rejected before they can be enqueued.
8. Scale workers horizontally by running multiple worker processes that independently poll the queue, with no shared in-process state required beyond the database and Redis.

---

## Core User Flow

1. **Open the dashboard** — the operator navigates to the FlowForge web UI and views the workflow list.
2. **Create a workflow** — the operator clicks "New Workflow", gives it a name, and is taken to the workflow editor.
3. **Add steps** — for each step, the operator selects a registered handler (e.g., `blob-to-postgres`), fills in its input schema (source connection reference, target table, column mapping, batch size), sets a retry policy (`maxAttempts`, `baseDelayMs`), and sets a timeout.
4. **Define dependencies** — the operator links steps by specifying which step keys each step depends on, forming a DAG.
5. **Save the workflow** — the API validates the DAG (topological sort, handler existence, no cycles, input schema conformance) and persists the `Workflow` and `WorkflowStep` records. Invalid definitions are rejected with field-level error messages.
6. **Trigger a workflow run** — the operator (or an external caller) sends `POST /api/workflows/:id/runs` with an input payload. The engine creates a `WorkflowRun`, pre-creates all `StepRun` rows in `PENDING` state, and immediately transitions root steps (those with no dependencies) to `QUEUED`.
7. **Workers execute steps** — one or more worker processes claim `QUEUED` steps atomically using `SELECT … FOR UPDATE SKIP LOCKED`, set the row to `RUNNING`, and execute the matching handler. The handler emits progress events (e.g., copied row count) throughout execution.
8. **Step completes or fails** — on success, the worker writes the output payload back to the `StepRun` row, marks it `SUCCEEDED`, and emits a status event. The engine atomically transitions any downstream steps whose dependencies are now fully met to `QUEUED`. On failure, the step is scheduled for retry or moved to `DEAD_LETTERED` after all attempts are exhausted.
9. **Dashboard updates in real time** — status events flow from workers → Redis Pub/Sub → SSE Gateway → dashboard. The UI merges delta events into its local state without polling. On page load or reconnection, it fetches full state from `GET /api/runs/:id` first.
10. **Operator inspects a failure** — the operator drills into the failed `StepRun`, reads structured logs (worker ID, handler, timestamps, error trace), and decides to retry the step (`POST /api/steps/:id/retry`) or replay the entire run from a specific step (`POST /api/runs/:id/replay`).
11. **Workflow completes** — when all steps reach `SUCCEEDED`, the `WorkflowRun` is marked `COMPLETED`. If any step reaches `DEAD_LETTERED`, the `WorkflowRun` is marked `FAILED`.

---

## Features

### Workflow Definition & Validation

- Define workflows as named, versioned DAGs composed of typed steps.
- Each step specifies a `handler_name`, input configuration, `retryPolicy` (`maxAttempts`, `baseDelayMs`), and `timeoutSeconds`.
- Steps declare dependencies by referencing sibling step keys; outputs of parent steps are mapped as inputs to child steps.
- On save, the API validates: unique step keys, handler existence in the registry, no dependency cycles (topological sort), all steps reachable from a root, retry/timeout values within allowed limits, and input schema conformance where schema validation is defined.
- Invalid workflows are rejected immediately with actionable, field-level error messages.

### Job Execution Engine

- PostgreSQL-backed queue using `SELECT … FOR UPDATE SKIP LOCKED` for distributed atomic job claiming.
- All `StepRun` rows are pre-created in `PENDING` state when a `WorkflowRun` is initialized, preventing duplicate row creation under concurrent parent completions.
- Downstream steps are atomically transitioned to `QUEUED` only when all dependency step runs have `SUCCEEDED`, enforced by a single conditional SQL update with a `UNIQUE (workflow_run_id, step_id)` constraint as a final safeguard.
- Workers maintain a **handler registry** mapping handler names to async TypeScript functions; each claimed step is dispatched to its matching handler.

### Handler Registry

- **Predefined handlers** shipped with the platform: `http-request`, `send-email`, `sql-query`, `blob-to-postgres`, `transform-json`, `repo-indexer`, `embedding-generator`.
- **Developer-registered custom handlers**: engineers add and register handlers in code; users reference them by name from workflow definitions.
- Handlers receive a typed `StepContext` (`workflowRunId`, `stepRunId`, `attempt`, `idempotencyKey`, `signal: AbortSignal`).
- Connection credentials are stored as named connection references (e.g., `postgres-warehouse`, `azure-blob-prod`); raw secrets are never stored in workflow JSON.

### Retry & Failure Recovery

- Exponential backoff with randomized jitter: `retryDelay = baseDelay × 2^attempt + randomJitter`.
- Failed steps move to `RETRYING` state; `next_run_at` is persisted in PostgreSQL. The Scheduler periodically promotes due retries back to `QUEUED`; workers never sleep for retry delays.
- After all retry attempts are exhausted, the step moves to `DEAD_LETTERED`. The `WorkflowRun` is marked `FAILED`. The dead-letter record stores the payload, full stack trace, retry history, worker ID, and timestamps.
- Workers commit results using a fencing-token query (`WHERE worker_id = :id AND lease_expire > NOW() AND status = 'RUNNING'`); stale workers that lost their lease discard their results.
- A background lease sweeper re-queues steps stuck in `RUNNING` with expired leases. Steps exceeding `max_retries` are automatically moved to `DEAD_LETTERED` by the sweeper.

### Idempotency

- Each `StepRun` is assigned an `idempotency_key = workflow_run_id + step_id + attempt_group`.
- Before executing, workers check a completion record for the key. If a matching completed record exists, execution is skipped and the prior result is returned, minimizing duplicate side effects under at-least-once delivery.

### Replay & Cancellation

- **Replay**: operator selects a failed `WorkflowRun` and a replay point. The engine creates a new `WorkflowRun` linked via `original_run_id`. Steps completed before the replay point are marked `SUCCEEDED` instantly with their original output payloads copied; execution resumes from the selected step forward.
- **Cancel**: operator issues `POST /api/runs/:id/cancel`. `PENDING` and `QUEUED` steps move to `CANCELLED`. `RUNNING` steps receive an `AbortSignal`; handlers are expected to check `signal.aborted`, release resources, and stop cleanly. The `WorkflowRun` becomes `CANCELLED` once all running steps stop.

### Scheduler

- MVP: scans PostgreSQL on a regular interval for `step_runs` in `RETRYING` state where `next_run_at <= now()` and re-queues them by updating their status to `QUEUED`.
- V2 (post-MVP): creates `WorkflowRun`s from `SCHEDULED_ONCE`, `INTERVAL`, and `CRON` triggers; computes and persists `next_fire_at`; supports missed-run backfill.

### Real-Time Dashboard

- Displays: queue depth, workflow throughput (jobs/sec), active workflow runs, worker health, step execution timelines, DAG graph with live step state colours, retry counts, DLQ size, failure rate.
- Supports: retry individual steps, replay failed runs, cancel active runs, filter by status/date/workflow, full-text log inspection, workflow search.
- Real-time updates via SSE; on load or reconnect the UI performs a full state fetch from the REST API to guarantee consistency.
- Visual DAG rendered with ReactFlow showing each step's current state.

### Observability

- Prometheus metrics endpoint exposing: jobs/sec, queue latency (p50/p95/p99), worker utilization, retry rate, success rate, failure rate, DLQ depth.
- Structured JSON logs via Pino for every step execution: worker ID, handler name, start/end timestamps, input payload metadata (no secrets), output payload metadata, error traces.
- Logs stored in PostgreSQL (`step_logs` table) with a 7–30 day retention policy. Secrets and connection strings are redacted before persistence.
- Grafana dashboard connected to Prometheus for metric panels.

### Security

- JWT-based authentication on all API endpoints.
- Role-based access control (operator vs. read-only viewer).
- Audit logs for workflow creation, run triggering, retries, replays, and cancellations.
- Input payload sanitization before persistence.

---

## Scope

### In Scope

- REST API for creating workflows, enqueuing runs, fetching status, retrying steps, replaying runs, and cancelling runs.
- PostgreSQL-backed job queue using `SKIP LOCKED` for distributed, atomic step claiming.
- Workflow DAG validation (cycle detection via topological sort, handler existence check, schema conformance) at save time.
- Pre-creation of all `StepRun` rows in `PENDING` state on `WorkflowRun` initialization.
- Atomic dependency-aware step promotion from `PENDING` to `QUEUED`.
- Horizontally scalable Node.js workers sharing a PostgreSQL queue with no inter-process coordination.
- Handler registry with predefined handlers (`http-request`, `send-email`, `sql-query`, `blob-to-postgres`, `transform-json`, `repo-indexer`, `embedding-generator`) and support for developer-registered custom handlers.
- Exponential-backoff retry with randomized jitter and a Scheduler that promotes due retries without sleeping inside workers.
- Dead-letter queue storing payload, stack trace, retry history, worker ID, and timestamps for exhausted steps.
- Lease-based crash recovery with fencing-token commit queries and a background lease sweeper.
- Idempotency key generation and pre-execution duplicate check.
- Cooperative workflow cancellation via `AbortSignal` passed to handlers.
- Workflow replay from a selected step, preserving prior step outputs and linking new run to original via `original_run_id`.
- Real-time dashboard updates via Redis Pub/Sub → SSE Gateway with hybrid state-sync (initial REST fetch + SSE delta stream).
- Structured log persistence in PostgreSQL with redaction of secrets, 7–30 day retention.
- Prometheus metrics endpoint and Grafana dashboard.
- JWT authentication and role-based access control.
- Docker Compose configuration for one-command local start-up and horizontal worker scaling demonstration.

### Out of Scope

- Drag-and-drop, no-code workflow builder UI.
- Arbitrary user-uploaded code execution or sandboxed custom-code runners.
- Production-grade cron scheduler with second-level precision (V2 feature).
- Kubernetes-native orchestration or multi-region deployment.
- Force-killing running worker processes (hard termination is a future feature; cooperative cancellation only in MVP).
- Enterprise IAM, SAML, or SCIM integration.
- BPMN workflow notation or enterprise compliance workflow tooling.
- Object-storage log archival (raw logs to S3/Azure Blob with PostgreSQL pointers) — post-MVP scale path.
- Full event sourcing or replayable event streams (Kafka is intentionally excluded from MVP).
- Plugin marketplace or third-party handler distribution.
- Advanced billing or usage metering.
- Multi-tenant isolation at the infrastructure level.

---

## Success Criteria

1. A user can create a workflow with three or more steps and defined dependencies, save it, and receive a validation error (not a silent failure) if the DAG contains a cycle or references an unregistered handler.
2. A workflow run triggered via `POST /api/workflows/:id/runs` executes all steps in dependency order: no step begins before all of its declared parent steps have status `SUCCEEDED`.
3. Two worker processes running concurrently on the same PostgreSQL queue never execute the same `StepRun` twice within a single `attempt_group` — verified by checking the `step_run` rows after a run with two workers and one job.
4. A step that fails three consecutive times (with `maxAttempts: 3`) is automatically moved to `DEAD_LETTERED` state, and its parent `WorkflowRun` is marked `FAILED`, without any manual intervention.
5. After a simulated worker crash (process kill mid-execution), the orphaned `StepRun` lease expires and the step is re-queued by the lease sweeper within one sweeper interval, and a different worker picks it up and completes it.
6. A failed `WorkflowRun` can be replayed from a specified step: the new run shows `SUCCEEDED` for all pre-replay steps (with original output payloads copied) and executes only the steps from the replay point onward.
7. The dashboard reflects a step status change from `QUEUED` to `RUNNING` to `SUCCEEDED` within 3 seconds of the event occurring on the worker, without the user refreshing the page.
8. Prometheus exposes `flowforge_jobs_total`, `flowforge_queue_latency_seconds`, `flowforge_worker_active`, `flowforge_retry_total`, and `flowforge_dlq_depth` metrics, and a Grafana panel renders all five without errors.
9. The entire system (API, workers, PostgreSQL, Redis, Grafana) starts with a single `docker compose up` command and a complete end-to-end workflow run can be demonstrated within 5 minutes of first launch.
10. No plaintext secret or connection string appears in any `step_logs`, `step_runs`, or `workflow_steps` row in PostgreSQL after a workflow run that used named connection references.
