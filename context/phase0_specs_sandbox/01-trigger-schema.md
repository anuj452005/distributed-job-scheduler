# Unit 01 — Trigger Tables Schema

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/db/` (migrations only)  
> **Depends On**: Existing `workflow_runs` table (Unit 02 Phase 0 baseline)

---

## What This Unit Builds

Two forward-only SQL migration files that add the complete trigger persistence layer to the FlowForge database.

| File | Purpose |
|---|---|
| `010_create_workflow_triggers.sql` | Custom PostgreSQL ENUMs, `workflow_triggers` table, and four purpose-built indexes |
| `011_create_workflow_trigger_executions.sql` | `trigger_execution_status` ENUM, `workflow_trigger_executions` table, nullable-unique idempotency constraint |

**Visible result**: Running the migration runner produces both tables with all constraints and indexes verified against a live Neon PostgreSQL instance.

---

## Files To Create

### `packages/db/migrations/010_create_workflow_triggers.sql`

```sql
CREATE TYPE trigger_type AS ENUM ('cron', 'webhook', 'event');
CREATE TYPE trigger_status AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

CREATE TABLE workflow_triggers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          trigger_type NOT NULL,
  status        trigger_status NOT NULL DEFAULT 'ACTIVE',
  config        JSONB NOT NULL DEFAULT '{}',
  -- cron:    { "cron": "*/5 * * * *", "misfire_policy": "RUN_ONCE" }
  -- webhook: { "webhook_token": "<uuid>", "secret": "<hmac-secret>" }
  -- event:   { "event_type": "order.created" }
  next_fire_at  TIMESTAMPTZ,        -- cron only: next scheduled fire time
  last_fired_at TIMESTAMPTZ,        -- cached last execution time (dashboard perf)
  created_by    TEXT NOT NULL,      -- Clerk user ID
  updated_by    TEXT NOT NULL,      -- Clerk user ID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for efficient cron claiming (only ACTIVE cron rows indexed)
CREATE INDEX idx_workflow_triggers_cron
  ON workflow_triggers(next_fire_at)
  WHERE status = 'ACTIVE' AND type = 'cron';

-- Unique partial index for webhook token lookups (NULL tokens excluded)
CREATE UNIQUE INDEX idx_workflow_triggers_webhook_token
  ON workflow_triggers((config->>'webhook_token'))
  WHERE type = 'webhook';

-- Partial index for event type matching (only ACTIVE event rows indexed)
CREATE INDEX idx_workflow_triggers_event
  ON workflow_triggers((config->>'event_type'))
  WHERE status = 'ACTIVE' AND type = 'event';

-- Index for workflow-scoped trigger list lookups (dashboard CRUD)
CREATE INDEX idx_workflow_triggers_workflow
  ON workflow_triggers(workflow_id);
```

### `packages/db/migrations/011_create_workflow_trigger_executions.sql`

```sql
CREATE TYPE trigger_execution_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'DEDUPLICATED');

CREATE TABLE workflow_trigger_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id      UUID NOT NULL REFERENCES workflow_triggers(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          trigger_execution_status NOT NULL DEFAULT 'PENDING',
  payload         JSONB NOT NULL DEFAULT '{}',
  source_type     trigger_type NOT NULL,   -- analytics: which trigger type fired
  idempotency_key TEXT,                    -- webhook/event delivery ID; NULL for cron
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Nullable-unique: multiple NULLs allowed, but (trigger_id, key) must be unique
  CONSTRAINT uq_trigger_idempotency UNIQUE (trigger_id, idempotency_key)
);

-- Index for per-trigger execution history lookups
CREATE INDEX idx_trigger_executions_trigger_id
  ON workflow_trigger_executions(trigger_id, triggered_at DESC);
```

---

## Design Decisions

### Why Custom ENUMs Instead of TEXT with CHECK?
PostgreSQL ENUMs provide:
- **Type safety**: Invalid values are rejected at the DB layer, not application layer.
- **Index efficiency**: ENUM comparisons are integer-based internally.
- **Self-documentation**: `\dT` shows all valid values in `psql`.

Trade-off: Adding new ENUM values requires `ALTER TYPE ... ADD VALUE`, which is non-transactional. For MVP, three trigger types and four execution statuses are complete.

### Why Nullable Unique for `idempotency_key`?
- Cron triggers have no external delivery ID — they should **always** create a new execution row.
- Webhook/event triggers carry a vendor-issued delivery ID (e.g., GitHub `X-GitHub-Delivery`) — duplicates from retries should be silently deduplicated.
- PostgreSQL unique constraints treat `NULL` as distinct from all other values (including other `NULL`s), so `INSERT ... ON CONFLICT DO NOTHING` only deduplicates non-NULL keys.

### Why `last_fired_at` on `workflow_triggers`?
Dashboard trigger list pages need to show "last fired" without joining `workflow_trigger_executions` on every page load. This is a **write-side cache** updated atomically in the scheduler tick — a deliberate denormalization for read performance.

---

## Verification Checklist

After running the migration runner (`npm run db:migrate` or equivalent):

- [ ] `\d workflow_triggers` shows all columns with correct types and defaults
- [ ] `\d workflow_trigger_executions` shows `uq_trigger_idempotency` constraint
- [ ] `\di` shows all 5 new indexes (`idx_workflow_triggers_cron`, `idx_workflow_triggers_webhook_token`, `idx_workflow_triggers_event`, `idx_workflow_triggers_workflow`, `idx_trigger_executions_trigger_id`)
- [ ] Insert two `workflow_trigger_executions` rows with `idempotency_key = NULL` for the same `trigger_id` — both succeed (nullable-unique test)
- [ ] Insert two rows with the same non-NULL `(trigger_id, idempotency_key)` pair — second insert throws unique violation (deduplication test)
- [ ] Delete a `workflow_triggers` row — cascade deletes its `workflow_trigger_executions` rows
- [ ] Delete a `workflows` row — cascade deletes its `workflow_triggers` rows (and their executions transitively)
- [ ] `tsc --noEmit` exits 0 across the monorepo

---

## What Is NOT in This Unit

- No application code — purely DDL.
- No `@flowforge/trigger` package — that is Unit 02.
- No API routes — those are Unit 05 (CRUD) and Unit 06 (webhook endpoint).
