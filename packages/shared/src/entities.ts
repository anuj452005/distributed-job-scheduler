import type { WorkflowStatus, StepStatus, LogLevel, TriggerType, TriggerStatus, TriggerExecutionStatus } from './status.js';

export type WorkflowRow = {
  id:          string;
  name:        string;
  description: string | null;
  version:     number;
  created_by:  string;
  created_at:  Date;
  updated_at:  Date;
};

export type WorkflowStepRow = {
  id:              string;
  workflow_id:     string;
  step_key:        string;
  handler_name:    string;
  input_config:    Record<string, unknown>;
  retry_policy:    RetryPolicyRow;
  timeout_seconds: number;
  created_at:      Date;
};

export type RetryPolicyRow = {
  maxAttempts: number;
  baseDelayMs: number;
};

export type StepDependencyRow = {
  step_id:            string;
  depends_on_step_id: string;
};

export type WorkflowRunRow = {
  id:              string;
  workflow_id:     string;
  status:          WorkflowStatus;
  input_payload:   Record<string, unknown>;
  original_run_id: string | null;
  triggered_by:    string;
  started_at:      Date | null;
  completed_at:    Date | null;
  created_at:      Date;
};

export type StepRunRow = {
  id:               string;
  workflow_run_id:  string;
  step_id:          string;
  status:           StepStatus;
  attempt_count:    number;
  max_attempts:     number;
  idempotency_key:  string;
  input_payload:    Record<string, unknown>;
  output_payload:   Record<string, unknown> | null;
  error_message:    string | null;
  worker_id:        string | null;
  lease_expires_at: Date | null;
  next_run_at:      Date;
  priority:         number;
  started_at:       Date | null;
  completed_at:     Date | null;
  created_at:       Date;
};

export type StepLogRow = {
  id:          string;
  step_run_id: string;
  level:       LogLevel;
  message:     string;
  metadata:    Record<string, unknown>;
  created_at:  Date;
};

export type ConnectionRefRow = {
  id:               string;
  name:             string;
  type:             string;
  encrypted_config: Buffer;
  created_by:       string;
  created_at:       Date;
  updated_at:       Date;
};

export type WorkflowTriggerRow = {
  id:            string;
  workflow_id:   string;
  name:          string;
  type:          TriggerType;
  status:        TriggerStatus;
  config:        Record<string, unknown>;
  next_fire_at:  Date | null;
  last_fired_at: Date | null;
  created_by:    string;
  updated_by:    string;
  created_at:    Date;
  updated_at:    Date;
};

export type WorkflowTriggerExecutionRow = {
  id:              string;
  trigger_id:      string;
  workflow_run_id: string | null;
  triggered_at:    Date;
  status:          TriggerExecutionStatus;
  payload:         Record<string, unknown>;
  source_type:     TriggerType;
  idempotency_key: string | null;
  error_message:   string | null;
  created_at:      Date;
};

