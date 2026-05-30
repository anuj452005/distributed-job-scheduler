import type { Logger } from 'pino';

export type RetryPolicy = {
  maxAttempts: number;    // 1–10
  baseDelayMs: number;    // 100–60000
};

export type StepContext = {
  workflowRunId:  string;
  stepRunId:      string;
  attempt:        number;
  idempotencyKey: string;
  signal:         AbortSignal;   // cooperative cancellation
  logger:         Logger;        // Pino child logger bound to stepRunId
};

export type StepHandler = (
  ctx:   StepContext,
  input: unknown,
) => Promise<unknown>;

export type HandlerRegistry = Record<string, StepHandler>;

export type StepEvent = {
  type:           'step.queued' | 'step.started' | 'step.succeeded' |
                  'step.failed' | 'step.retrying' | 'step.dead_lettered' |
                  'step.cancelled' | 'workflow.completed' | 'workflow.failed' |
                  'workflow.cancelled';
  workflowRunId:  string;
  stepRunId?:     string;
  stepId?:        string;
  status:         string;
  timestamp:      string;        // ISO 8601
  workerId?:      string;
  attempt?:       number;
  errorMessage?:  string;
};

export type UserRole = 'operator' | 'viewer';
