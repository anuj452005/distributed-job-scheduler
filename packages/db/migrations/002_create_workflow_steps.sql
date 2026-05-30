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
