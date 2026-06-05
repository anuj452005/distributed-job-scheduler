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

export enum TriggerType {
  CRON = 'cron',
  WEBHOOK = 'webhook',
  EVENT = 'event',
}

export enum TriggerStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
}

export enum TriggerExecutionStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  DEDUPLICATED = 'DEDUPLICATED',
}

