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
  dependsOn?:     string[];
};

// Replay DTO
export type ReplayRunBody = {
  fromStepKey: string;   // replay from this step forward
};
