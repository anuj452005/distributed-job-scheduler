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
