# FlowForge — Phase 0: Trigger Subsystem Build Plan

> **Read this file before starting any implementation unit.**  
> Each unit in this plan produces one visible, testable result within one system boundary.

---

## What Phase 0 Builds

A fully decoupled, production-grade trigger subsystem (`@flowforge/trigger`) that allows workflows to be started automatically via three trigger types:

| Type | Activation |
|---|---|
| `cron` | Time-based schedule (e.g., `*/5 * * * *`) with misfire recovery |
| `webhook` | Inbound HTTP POST to a unique token URL with HMAC validation |
| `event` | Redis Pub/Sub message on a named channel |

---

## Guiding Rules

- **One unit at a time.** Never start the next unit until the current one's Verification Checklist is fully checked off.
- **No DB migrations after Unit 01.** All trigger configuration lives in `config JSONB`. No schema changes in Units 02–07.
- **Idempotency is non-negotiable.** Every trigger execution must be protected against duplicate delivery. The `(trigger_id, idempotency_key)` nullable unique constraint is the single enforcement point.
- **Non-blocking dispatching.** The cron scheduler must never hold a DB transaction open during workflow run creation.
- **State machine strictly enforced.** Trigger status transitions (`ACTIVE ↔ PAUSED → DISABLED`) must go through the transition endpoints — not direct `UPDATE` statements in route handlers.

---

## Stack Additions (Phase 0 only)

| Concern | Technology |
|---|---|
| Cron parsing & misfire calculation | `cron-parser` npm package (installed in `packages/scheduler`) |
| HMAC signature validation | Node.js built-in `node:crypto` — no new package |
| Webhook token generation | `randomUUID()` from `node:crypto` — no new package |
| Cron human-readable preview (UI) | `cronstrue` npm package (installed in `packages/dashboard`) |

---

## Unit Build Order

| # | Unit Name | Spec File | What It Delivers | Depends On |
|---|---|---|---|---|
| 01 | Trigger Tables Schema | [01-trigger-schema.md](./01-trigger-schema.md) | Two SQL migrations: `workflow_triggers` table + `workflow_trigger_executions` table with all ENUMs, indexes, and nullable-unique idempotency constraint | Existing `workflows`, `workflow_runs` tables |
| 02 | `@flowforge/trigger` Package | [02-trigger-service-package.md](./02-trigger-service-package.md) | New monorepo package with `triggerWorkflow()` function: atomic INSERT claim + non-transactional engine dispatch. Full TypeScript types exported. | Unit 01, `@flowforge/engine`, `@flowforge/db` |
| 03 | Non-Blocking Cron Scheduler | [03-cron-scheduler.md](./03-cron-scheduler.md) | `runCronSchedulerTick()` in `packages/scheduler`: two-phase locking (transactional advance, non-transactional dispatch). Three misfire policies: `SKIP`, `RUN_ONCE`, `CATCH_UP`. Wired into existing scheduler start loop. | Units 01–02, `cron-parser` package |
| 04 | Webhook Token Receiver | [04-webhook-receiver.md](./04-webhook-receiver.md) | Public `POST /api/webhooks/:token` route. Lookup by unique index, timing-safe HMAC validation, `X-FlowForge-Delivery` idempotency header support. No Clerk auth. | Units 01–02, existing API auth foundation |
| 05 | Event Trigger Listener | [05-event-trigger-listener.md](./05-event-trigger-listener.md) | `startEventTriggerListener()` using Redis `PSUBSCRIBE flowforge:external:*`. Fan-out to all matching ACTIVE event triggers. Structured envelope with `delivery_id` for idempotency. Graceful shutdown. | Units 01–02, `@flowforge/events` Redis client |
| 06 | Trigger CRUD API & State Machine | [06-trigger-crud-api.md](./06-trigger-crud-api.md) | 8 REST endpoints: create/list/get/update triggers + pause/resume/disable/delete state transitions. Zod validation, role guards, cron expression validation, auto-generated webhook tokens. | Units 01–02, existing Clerk auth middleware |
| 07 | Dashboard Trigger Management UI | [07-dashboard-triggers-ui.md](./07-dashboard-triggers-ui.md) | React "Triggers" tab on workflow detail page. Create modal (3 trigger types), list with status badges, pause/resume/disable buttons, detail drawer with execution history. | Unit 06 (all API endpoints live) |

---

## Dependency Graph

```
Unit 01 (Schema)
    │
    ├──► Unit 02 (TriggerService)
    │         │
    │         ├──► Unit 03 (Cron Scheduler)
    │         ├──► Unit 04 (Webhook Receiver)
    │         └──► Unit 05 (Event Listener)
    │
    └──► Unit 06 (CRUD API)  ──► Unit 07 (Dashboard UI)
```

Units 03, 04, and 05 can be built in any order after Unit 02. They are mutually independent.

---

## Invariants (Phase 0)

These must never be violated in any unit's implementation:

1. **Trigger status is never set directly in route handlers.** All transitions go through dedicated SQL `UPDATE ... WHERE status = ANY(...)` + `RETURNING id` pattern.
2. **`triggerWorkflow()` is the only function that inserts into `workflow_trigger_executions`.** No route handler or scheduler writes to this table directly.
3. **HMAC comparison must always use `timingSafeEqual`.** Never `===` or `.toString() ===`.
4. **Cron scheduler commit must happen before dispatch.** The `COMMIT` releasing the `FOR UPDATE SKIP LOCKED` lock must complete before `triggerWorkflow()` is called.
5. **Event listener uses a dedicated Redis subscriber connection.** It must never share the publisher/pool connection.
6. **Triggers with `status = 'DISABLED'` must be silently ignored** by the cron tick, webhook receiver, and event listener (the DB `WHERE status = 'ACTIVE'` filter enforces this — don't add application-layer checks).

---

## Phase 0 Completion Criteria

All units complete when:

- [ ] All 7 verification checklists are fully checked off
- [ ] `tsc --noEmit` exits 0 across the entire monorepo
- [ ] A cron trigger fires on schedule and creates `workflow_runs`
- [ ] A webhook POST with a valid HMAC signature creates a `workflow_runs` entry
- [ ] A Redis PUBLISH to `flowforge:external:<event_type>` fires matching triggers
- [ ] Duplicate webhook deliveries (same `X-FlowForge-Delivery`) are deduplicated
- [ ] All state transitions work: `ACTIVE → PAUSED → ACTIVE → DISABLED`
- [ ] The dashboard Triggers tab shows live trigger state and execution history
