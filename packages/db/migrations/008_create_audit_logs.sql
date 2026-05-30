CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    TEXT NOT NULL,       -- Clerk user ID
  action      TEXT NOT NULL,       -- e.g. "workflow.create", "run.trigger", "run.cancel"
  resource_id TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
