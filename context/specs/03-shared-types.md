# Unit 03 — Shared Types Package

## What This Unit Builds

`packages/shared` — the single source of truth for TypeScript types,
status enums, DTOs, and interfaces that every other package imports.
No runtime logic. No side effects. No imports from other `packages/*`.

**Done looks like:**
- `tsc --noEmit` on `packages/shared` exits 0 with strict mode.
- Every other package can import from `@flowforge/shared` without errors.
- All status enums, entity shapes, and the `StepContext` / `StepHandler`
  types are defined and exported.

---

## Dependencies

- Unit 01 — Monorepo scaffold exists; `packages/shared` directory is present.

---

## Files to Create

```
packages/shared/src/
├── index.ts           # re-exports everything
├── status.ts          # WorkflowStatus, StepStatus enums
├── types.ts           # StepContext, StepHandler, RetryPolicy, etc.
├── dto.ts             # API request/response data shapes
└── entities.ts        # DB entity shapes (mirrors table columns)
```

---

## Types to Define

### `status.ts`

```ts
export enum WorkflowStatus {
  PENDING    = 'PENDING',
  RUNNING    = 'RUNNING',
  COMPLETED  = 'COMPLETED',
  FAILED     = 'FAILED',
  CANCELLED  = 'CANCELLED',
}

export enum StepStatus {
  PENDING          = 'PENDING',
  QUEUED           = 'QUEUED',
  RUNNING          = 'RUNNING',
  SUCCEEDED        = 'SUCCEEDED',
  FAILED           = 'FAILED',
  RETRYING         = 'RETRYING',
  DEAD_LETTERED    = 'DEAD_LETTERED',
  CANCELLED        = 'CANCELLED',
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
}

export enum AuditAction {
  WORKFLOW_CREATE  = 'workflow.create',
  WORKFLOW_UPDATE  = 'workflow.update',
  WORKFLOW_DELETE  = 'workflow.delete',
  RUN_TRIGGER      = 'run.trigger',
  RUN_CANCEL       = 'run.cancel',
  RUN_REPLAY       = 'run.replay',
  STEP_RETRY       = 'step.retry',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO  = 'INFO',
  WARN  = 'WARN',
  ERROR = 'ERROR',
}
```

### `types.ts`

```ts
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
```

### `entities.ts`

DB row shapes — mirror the columns defined in Unit 02.

```ts
import type { WorkflowStatus, StepStatus, LogLevel } from './status.js';

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
```

### `dto.ts`

API-facing shapes (camelCase, serializable, no `Date` objects — use `string`).

```ts
// Workflow DTOs
export type WorkflowStepInput = {
  stepKey:        string;
  handlerName:    string;
  inputConfig:    Record<string, unknown>;
  retryPolicy:    { maxAttempts: number; baseDelayMs: number };
  timeoutSeconds: number;
  dependsOn:      string[];   // step keys
};

export type CreateWorkflowBody = {
  name:        string;
  description?: string;
  steps:       WorkflowStepInput[];
};

export type WorkflowDto = {
  id:          string;
  name:        string;
  description: string | null;
  version:     number;
  stepCount:   number;
  createdAt:   string;
  updatedAt:   string;
};

// Run DTOs
export type TriggerRunBody = {
  inputPayload?: Record<string, unknown>;
};

export type WorkflowRunDto = {
  id:            string;
  workflowId:    string;
  status:        string;
  inputPayload:  Record<string, unknown>;
  originalRunId: string | null;
  triggeredBy:   string;
  startedAt:     string | null;
  completedAt:   string | null;
  createdAt:     string;
  steps:         StepRunDto[];
};

export type StepRunDto = {
  id:             string;
  stepId:         string;
  stepKey:        string;
  handlerName:    string;
  status:         string;
  attemptCount:   number;
  maxAttempts:    number;
  inputPayload:   Record<string, unknown>;
  outputPayload:  Record<string, unknown> | null;
  errorMessage:   string | null;
  workerId:       string | null;
  startedAt:      string | null;
  completedAt:    string | null;
  createdAt:      string;
};

// Replay DTO
export type ReplayRunBody = {
  fromStepKey: string;   // replay from this step forward
};
```

---

## Verification Checklist

- [ ] `tsc --noEmit` on `packages/shared` exits 0.
- [ ] `packages/shared/src/index.ts` re-exports all types from all sub-files.
- [ ] Zero imports from other `packages/*` in `packages/shared`.
- [ ] `StepStatus` has all 9 values: `PENDING`, `QUEUED`, `RUNNING`, `SUCCEEDED`,
      `FAILED`, `RETRYING`, `DEAD_LETTERED`, `CANCELLED`, `CANCEL_REQUESTED`.
- [ ] `StepContext` includes `signal: AbortSignal` and `logger: Logger`.
- [ ] `StepHandler` type is `(ctx: StepContext, input: unknown) => Promise<unknown>`.
