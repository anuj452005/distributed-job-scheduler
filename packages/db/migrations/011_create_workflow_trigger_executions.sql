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
