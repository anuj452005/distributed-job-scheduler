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
