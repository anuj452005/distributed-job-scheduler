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
