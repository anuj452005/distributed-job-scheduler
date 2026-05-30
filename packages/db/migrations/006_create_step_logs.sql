CREATE TABLE step_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_run_id UUID NOT NULL REFERENCES step_runs(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,   -- DEBUG | INFO | WARN | ERROR
  message     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
