# FlowForge — Phase 0: Trigger Subsystem Diagrams

> Visual architectural reference for the Phase 0 Trigger Subsystem.
> Read alongside `flowforge/context/phase0_specs/` unit spec files.

📖 **New to this?** → Read the **[Beginner SDE Guide](./BEGINNER_GUIDE.md)** — explains every diagram with real code examples, the *why* behind each design decision, and a full interview cheat sheet.

---

## How the System Worked Initially (Before Triggers)

Before Phase 0, FlowForge had **no automated trigger mechanism**. Every workflow run was started manually by an operator or calling system through a single REST endpoint:

```http
POST /api/workflows/:workflowId/runs
Body: { "inputPayload": { ... } }
```

### Initial Architecture (Manual-Only)

```
Operator / Dashboard
        │
        ▼  POST /api/workflows/:id/runs
  Fastify API
        │
        ▼
  Workflow Service  ─────────────────────────────────────┐
        │                                                 │
        ▼                                                 ▼
  PostgreSQL                                        Redis Pub/Sub
  ┌───────────────────┐                                   │
  │  workflow_runs    │                                   ▼
  │  step_runs        │                            SSE Gateway → Dashboard
  └───────────────────┘
        │
        ▼
  Worker Pool → Handler Registry
```

### What This Meant in Practice

| Aspect | Behaviour |
|--------|-----------|
| **Who starts a run?** | A human or external system calls the REST API directly |
| **Time-based automation** | ❌ Not supported — no scheduled runs |
| **Event-driven automation** | ❌ Not supported — no webhook or event listener |
| **Deduplication** | ❌ No idempotency mechanism — duplicate API calls would create duplicate runs |
| **Trigger config persistence** | ❌ No trigger rows in the database — every call was stateless |
| **State machine for triggers** | ❌ Did not exist — a trigger was just an HTTP call |

### The Core Limitation

Because the only entry point was a direct API call, FlowForge required **manual intervention** every time a workflow needed to run. There was no way to:
- Run a nightly data pipeline at 2 am automatically
- Start a workflow the moment a GitHub push arrived
- React when an internal service published a `payment.failed` event on Redis

Scaling to production automation required adding a dedicated, reliable trigger subsystem — which is exactly what **Phase 0** delivered.

---

## How the System Works After Adding Triggers (Phase 0)

Phase 0 introduced a fully automated **Trigger Subsystem** that sits *in front of* the existing workflow engine. Three new trigger sources were added, all funnel through a single shared `TriggerService`, and every firing is recorded in two new PostgreSQL tables.

### Updated Architecture (With Trigger Subsystem)

```
┌──────────────────────────────────────────────────────┐
│                  TRIGGER SOURCES                      │
│                                                      │
│  ⏰ Cron Scheduler    🔔 Webhook Receiver    📡 Event Listener │
│  (polls every 10s)   (POST /webhooks/:token) (Redis PSUBSCRIBE)│
└────────────────┬───────────────┬──────────────┬──────┘
                 │               │              │
                 └───────────────┼──────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │  @flowforge/trigger · TriggerService  │
              │                                      │
              │  triggerWorkflow()                   │
              │  ├── Atomic idempotency claim INSERT  │
              │  ├── Deduplication (ON CONFLICT)      │
              │  └── createWorkflowRun() on success   │
              └──────────────────┬───────────────────┘
                                 │
               ┌─────────────────┴────────────────────┐
               │                                       │
               ▼                                       ▼
  ┌──────────────────────────┐         ┌───────────────────────────┐
  │     PostgreSQL           │         │    Existing Engine        │
  │  workflow_triggers       │         │    (unchanged)            │
  │  workflow_trigger_executions│      │  workflow_runs            │
  │  (4 partial indexes)     │         │  step_runs                │
  └──────────────────────────┘         │  Worker Pool              │
                                       └───────────────────────────┘
```

### The Three New Trigger Types

| Trigger | Real-World Analogy | How It Fires |
|---------|-------------------|--------------|
| **Cron** | An alarm clock | Scheduler polls every ~10 s; fires when `next_fire_at ≤ NOW()` |
| **Webhook** | A doorbell | External system calls `POST /api/webhooks/:token`; HMAC-validated |
| **Event** | A notification bell | Internal service publishes to Redis; `PSUBSCRIBE flowforge:external:*` fan-out |

### What Changed Compared to Before

| Aspect | Before (Manual) | After Phase 0 (Triggers) |
|--------|-----------------|--------------------------|
| **Who starts a run?** | Human/external system via REST | Any of 3 automated sources, or still REST |
| **Time-based automation** | ❌ | ✅ Cron trigger with misfire policies (SKIP / RUN_ONCE / CATCH_UP) |
| **Webhook automation** | ❌ | ✅ HMAC-validated, idempotency-deduped webhook receiver |
| **Event-driven automation** | ❌ | ✅ Redis Pub/Sub event listener with pattern subscription |
| **Idempotency** | ❌ | ✅ `INSERT … ON CONFLICT DO NOTHING` on `(trigger_id, idempotency_key)` |
| **Trigger config persistence** | ❌ | ✅ `workflow_triggers` table — one row per configured trigger |
| **Execution history** | ❌ | ✅ `workflow_trigger_executions` — full audit log per firing |
| **State machine** | ❌ | ✅ `ACTIVE → PAUSED → DISABLED` with explicit transition API |
| **Duplicate protection** | ❌ | ✅ Nullable-unique constraint (`NULL ≠ NULL` for cron; keyed dedup for webhooks/events) |
| **Security** | ❌ | ✅ HMAC-SHA256 + `timingSafeEqual` for webhook token verification |

### The Safety Spine: Single Enforcement Point

All three trigger sources call the **same** `triggerWorkflow()` function. This is the most important architectural decision in Phase 0:

```
Before Phase 0:
  API call → createWorkflowRun()  (no idempotency, no audit log)

After Phase 0:
  Any trigger source
       │
       ▼
  triggerWorkflow()
  ├── INSERT INTO workflow_trigger_executions
  │   ON CONFLICT (trigger_id, idempotency_key) DO NOTHING
  │   RETURNING id                     ← returns nothing if duplicate
  │
  ├── if claimId exists → createWorkflowRun()  ← safe to proceed
  └── if no claimId    → return DEDUPLICATED   ← already processed
```

The database itself enforces the safety invariant — no application-level race conditions possible.

### New Database Tables Added

**`workflow_triggers`** — Trigger definitions (one row per configured trigger):
- `id`, `workflow_id`, `name`, `type` (cron | webhook | event)
- `status` (ACTIVE | PAUSED | DISABLED)
- `config` (JSONB — stores cron expression, webhook token, or event type)
- `next_fire_at`, `last_fired_at`

**`workflow_trigger_executions`** — Execution audit log (one row per firing attempt):
- `trigger_id`, `workflow_run_id`
- `status` (PENDING | SUCCEEDED | FAILED | DEDUPLICATED)
- `idempotency_key` (nullable — NULL for cron, vendor delivery ID for webhooks/events)
- `source_type`, `error_message`

### New REST API Surface Added

```http
POST   /api/workflows/:workflowId/triggers      # Create trigger
GET    /api/workflows/:workflowId/triggers      # List triggers
GET    /api/triggers/:triggerId                  # Get trigger details
PUT    /api/triggers/:triggerId                  # Update trigger config
DELETE /api/triggers/:triggerId                  # Delete (DISABLED only)

POST   /api/triggers/:triggerId/pause            # ACTIVE → PAUSED
POST   /api/triggers/:triggerId/resume           # PAUSED → ACTIVE
POST   /api/triggers/:triggerId/disable          # → DISABLED (terminal)

POST   /api/webhooks/:webhookToken               # Public webhook receiver
```

The existing `POST /api/workflows/:workflowId/runs` still works exactly as before — Phase 0 adds automation on top without breaking the manual path.

---

## Diagram Index

| # | File | What It Shows |
|---|---|---|
| 01 | [phase0_01_trigger_architecture.png](./phase0_01_trigger_architecture.png) | Full system architecture — three trigger sources, TriggerService, DB tables, Engine |
| 02 | [phase0_02_trigger_schema.png](./phase0_02_trigger_schema.png) | PostgreSQL schema — both tables, ENUMs, indexes, nullable-unique constraint |
| 03 | [phase0_03_cron_webhook_flow.png](./phase0_03_cron_webhook_flow.png) | Step-by-step flow for Cron (two-phase) and Webhook (HMAC + idempotency) |
| 04 | [phase0_04_state_machine_api.png](./phase0_04_state_machine_api.png) | Trigger state machine (ACTIVE ↔ PAUSED → DISABLED) + full REST API reference |
| 05 | [phase0_05_idempotency_event.png](./phase0_05_idempotency_event.png) | Idempotency engine (nullable unique) + Redis PSUBSCRIBE fan-out architecture |

---

## 01 — System Architecture

![Phase 0 Trigger Subsystem Architecture](./phase0_01_trigger_architecture.png)

The top-level view. Three trigger sources (Cron Scheduler, Webhook Receiver, Event Listener) all funnel into the `@flowforge/trigger` TriggerService, which performs a two-phase atomic insert + engine dispatch into PostgreSQL.

---

## 02 — Database Schema

![Trigger Database Schema](./phase0_02_trigger_schema.png)

Full column-level view of both new tables: `workflow_triggers` and `workflow_trigger_executions`. Shows all four partial indexes and the nullable-unique idempotency constraint that is the safety spine of the entire subsystem.

---

## 03 — Cron & Webhook Execution Flows

![Cron and Webhook Flow](./phase0_03_cron_webhook_flow.png)

Side-by-side flow diagrams:
- **Left**: Cron two-phase flow — transactional `FOR UPDATE SKIP LOCKED` claim + non-transactional dispatch + misfire policy resolution.
- **Right**: Webhook flow — token lookup → HMAC validation → idempotency check → 202/200/401/409 response.

---

## 04 — State Machine & REST API

![State Machine and REST API](./phase0_04_state_machine_api.png)

The `trigger_status` state machine with explicit labeled transitions, plus the full REST CRUD API surface (9 endpoints) with auth levels and config JSONB examples per trigger type.

---

## 05 — Idempotency Engine & Event Listener

![Idempotency and Event Listener](./phase0_05_idempotency_event.png)

Deep-dive on two key mechanisms:
- **Left**: How `NULL ≠ NULL` in PostgreSQL unique constraints enables cron runs to always insert while deduplicating webhook/event duplicates.
- **Right**: Redis `PSUBSCRIBE flowforge:external:*` fan-out — one message fires all matching ACTIVE event triggers in parallel, each with independent idempotency tracking.
