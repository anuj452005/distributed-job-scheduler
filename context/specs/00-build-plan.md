# FlowForge — Master Build Plan

> Read this file before starting any implementation unit.
> Each unit links to its own spec file in `flowforge/context/specs/`.

---

## Guiding Rules

- **One unit at a time.** Never start the next unit until the current one passes all checks
  in the Verification Checklist (`ai-workflow-rules.md`).
- **Test locally before committing.** Ask the user to verify the feature works, then commit
  and create a new git branch for the next unit.
- **One visible result per unit.** If a unit produces nothing you can point to and test, it
  should be merged with an adjacent unit.
- **Dependencies just-in-time.** Do not install packages, run migrations, or stand up
  infrastructure before the unit that actually needs it.
- **No V2 work.** Mark V2 concerns with `// TODO(v2):` and skip them entirely.

---

## Stack Summary

| Concern          | Technology                                              |
|------------------|---------------------------------------------------------|
| API server       | Node.js + Fastify + TypeScript (strict)                 |
| Engine           | TypeScript module (inside API process)                  |
| Scheduler        | TypeScript timer loop (inside API process)              |
| Worker           | Separate Node.js process, N instances                   |
| Queue backend    | PostgreSQL `step_runs` table + `SKIP LOCKED`            |
| Database         | PostgreSQL 16 (Docker locally, Azure Flexible in prod)  |
| Cache / Pub-Sub  | Redis (Docker locally, Azure Cache for Redis in prod)   |
| Dashboard        | React 18 + TypeScript + Tailwind + shadcn/ui + ReactFlow|
| Auth             | Clerk (hosted JWTs, `@clerk/fastify` + `@clerk/react`)  |
| Observability    | Pino JSON logs (stdout) — Prometheus + Grafana are V2   |
| Local dev        | Docker Compose (`api`, `worker` only) — PostgreSQL and  |
|                  | Redis are Azure-managed in both local dev and prod       |

---

## Build Order

| # | Unit Name | File | What It Delivers |
|---|-----------|------|------------------|
| 01 | Repo Scaffold & Docker Compose | `01-repo-scaffold.md` | Runnable monorepo skeleton; `docker compose up` starts `api` + `worker` (PostgreSQL and Redis are Azure-managed — no local containers) |
| 02 | Database Schema & Migrations | `02-db-schema.md` | All tables, indexes, constraints — tested via `psql` |
| 03 | Shared Types Package | `03-shared-types.md` | `packages/shared` with all status enums, DTOs, `StepContext`, `StepHandler` |
| 04 | DB Package & Connection Pool | `04-db-package.md` | `packages/db` pool + migration runner; migrations applied on startup |
| 05 | Queue SQL Package | `05-queue-package.md` | `packages/queue` claim, lease-refresh, sweeper, promotion queries — unit-tested |
| 06 | Handler Registry & Core Handlers | `06-handlers.md` | `packages/handlers` with all 7 predefined handlers registered and schema-validated |
| 07 | Worker Process | `07-worker.md` | Working worker that claims, executes, commits, heartbeats, and shuts down gracefully |
| 08 | Scheduler & Lease Sweeper | `08-scheduler.md` | Retry promotion + lease sweeper loops; dead-letter on exhaustion — verified end-to-end |
| 09 | Events Package (Redis Pub/Sub) | `09-events-package.md` | `packages/events` publish helpers + SSE subscription helpers |
| 10 | Engine Package | `10-engine.md` | `packages/engine` DAG validation, run creation, step pre-creation, downstream promotion |
| 11 | API Server Foundation & Auth | `11-api-foundation.md` | Fastify server boots; Clerk JWT middleware enforces `operator`/`viewer` on all routes |
| 12 | Workflow CRUD API | `12-workflow-crud-api.md` | `POST /api/workflows`, `GET /api/workflows`, `GET /api/workflows/:id`, `PUT`, `DELETE` |
| 13 | Run Trigger & Status API | `13-run-api.md` | `POST /api/workflows/:id/runs`, `GET /api/runs/:id`, `GET /api/runs` |
| 14 | Step Retry, Replay & Cancel API | `14-ops-api.md` | `POST /api/steps/:id/retry`, `POST /api/runs/:id/replay`, `POST /api/runs/:id/cancel` |
| 15 | SSE Gateway | `15-sse-gateway.md` | `GET /api/events/stream` bridges Redis Pub/Sub to browser `EventSource` |
| 17 | Dashboard Shell & Auth | `17-dashboard-shell.md` | React app boots; Clerk sign-in wall; authenticated shell with nav + sidebar |
| 18 | Workflow List & Create Pages | `18-workflow-list-create.md` | Workflow list table + \"New Workflow\" form with step builder and DAG edge definition |
| 19 | Run Detail Page & DAG Viewer | `19-run-detail-dag.md` | Run detail with ReactFlow DAG, live step state colors, step detail drawer + logs |
| 20 | Dashboard Home Metrics & Run List | `20-dashboard-home.md` | Home page: metric cards (queue depth, workers, jobs/sec, DLQ) + recent runs table with SSE |
| 21 | Structured Logging & Secret Redaction | `21-logging.md` | Pino logger wired to `step_logs`; secret-field redaction verified end-to-end |
| 22 | Connection References API & Encryption | `22-connection-refs.md` | `connection_refs` CRUD API; credentials encrypted at rest; decrypted in handlers only |
| 23 | End-to-End Integration & Docker Compose Polish | `23-e2e-integration.md` | Full workflow run verified from `docker compose up`; all 10 success criteria checked |

---

## Notes

- Units **01–08** form the **core backend execution engine**. They must be stable before any
  UI or API work begins, because the worker must be provably correct first.
- Units **09–15** are the **API + infrastructure layer**. They wire the engine to HTTP and Redis.
- Units **17–20** are the **dashboard**. They consume the API built in 11–15.
- Units **21–22** are **hardening** steps — logging and secret management. They can be done
  in parallel with the dashboard but must complete before Unit 23.
- Unit **23** is the **integration gate**. It verifies all 10 success criteria from `project-overview.md`.
- Unit **16** (`16-metrics.md`) — Prometheus endpoint + Grafana — is **deferred to V2**. Skip it entirely during MVP build.
