# Unit 02 — Database Schema & Migrations

## What This Unit Builds

All PostgreSQL tables, indexes, and constraints required for the entire
MVP, written as forward-only SQL migration files. After this unit,
`psql` can inspect every table and confirm the schema matches the
Storage Model in `architecture.md`.

**Done looks like:**
- Running the migration runner applies all migrations to the local
  postgres container without errors.
- `\dt` in psql lists all 8 tables.
- All critical indexes exist (verified with `\di`).
- The `UNIQUE (workflow_run_id, step_id)` constraint on `step_runs` is active.

---

## Dependencies

- Unit 01 — Docker Compose running; postgres container accessible.

---

## Tables to Create

All tables are defined in `architecture.md` → Storage Model. Implement exactly as specified.

### Migration files (in `packages/db/migrations/`)

```
001_create_workflows.sql
002_create_workflow_steps.sql
003_create_step_dependencies.sql
004_create_workflow_runs.sql
005_create_step_runs.sql
006_create_step_logs.sql
007_create_connection_refs.sql
008_create_audit_logs.sql
009_create_indexes.sql
```

### Table Schemas

#### `workflows`
```sql
CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL,          -- Clerk user ID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `workflow_steps`
```sql
CREATE TABLE workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,         -- unique within workflow
  handler_name    TEXT NOT NULL,
  input_config    JSONB NOT NULL DEFAULT '{}',
  retry_policy    JSONB NOT NULL DEFAULT '{"maxAttempts":3,"baseDelayMs":1000}',
  timeout_seconds INTEGER NOT NULL DEFAULT 300,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, step_key)
);
```

#### `step_dependencies`
```sql
CREATE TABLE step_dependencies (
  step_id            UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  depends_on_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, depends_on_step_id)
);
```

#### `workflow_runs`
```sql
CREATE TABLE workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  status          TEXT NOT NULL DEFAULT 'PENDING',
  input_payload   JSONB NOT NULL DEFAULT '{}',
  original_run_id UUID REFERENCES workflow_runs(id),   -- non-null for replays
  triggered_by    TEXT NOT NULL,                        -- Clerk user ID
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `step_runs`
```sql
CREATE TABLE step_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id  UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id          UUID NOT NULL REFERENCES workflow_steps(id),
  status           TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  idempotency_key  TEXT NOT NULL,
  input_payload    JSONB NOT NULL DEFAULT '{}',
  output_payload   JSONB,
  error_message    TEXT,
  worker_id        TEXT,
  lease_expires_at TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  priority         INTEGER NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_run_id, step_id)
);
```

#### `step_logs`
```sql
CREATE TABLE step_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_run_id UUID NOT NULL REFERENCES step_runs(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,   -- DEBUG | INFO | WARN | ERROR
  message     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `connection_refs`
```sql
CREATE TABLE connection_refs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,     -- e.g. "postgres-warehouse"
  type              TEXT NOT NULL,            -- e.g. "postgres" | "smtp" | "blob"
  encrypted_config  BYTEA NOT NULL,           -- AES-256-GCM encrypted JSON
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `audit_logs`
```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    TEXT NOT NULL,       -- Clerk user ID
  action      TEXT NOT NULL,       -- e.g. "workflow.create", "run.trigger", "run.cancel"
  resource_id TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Critical Indexes (from `architecture.md`)

```sql
-- Worker claim query
CREATE INDEX idx_step_runs_claim
  ON step_runs(status, next_run_at, priority DESC, created_at);

-- Lease sweeper
CREATE INDEX idx_step_runs_lease
  ON step_runs(status, lease_expires_at);

-- Dashboard log fetch
CREATE INDEX idx_step_logs_step_run
  ON step_logs(step_run_id, created_at);

-- Run lookup by workflow
CREATE INDEX idx_workflow_runs_workflow
  ON workflow_runs(workflow_id, created_at DESC);

-- Step run lookup by run
CREATE INDEX idx_step_runs_run
  ON step_runs(workflow_run_id);
```

---

## Verification Checklist

- [ ] `\dt` in psql lists: `workflows`, `workflow_steps`, `step_dependencies`,
      `workflow_runs`, `step_runs`, `step_logs`, `connection_refs`, `audit_logs`.
- [ ] `\di` confirms all 5 critical indexes exist.
- [ ] `UNIQUE (workflow_run_id, step_id)` constraint on `step_runs` confirmed via `\d step_runs`.
- [ ] `CASCADE` deletes work: deleting a `workflow` removes its `workflow_steps` and `step_dependencies`.
- [ ] Migration runner is idempotent: running it twice does not error.
- [ ] No migration uses `DROP TABLE` or `DROP COLUMN`.
