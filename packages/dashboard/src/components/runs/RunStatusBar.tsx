import { useState } from 'react';
import { Ban, RefreshCw } from 'lucide-react';
import { StepStatusBadge } from './StepStatusBadge.tsx';
import type { WorkflowRunDetailDto } from '../../api/runs.ts';

type RunStatusBarProps = {
  run: WorkflowRunDetailDto;
  onCancel: () => Promise<void>;
  onReplayAll: () => Promise<void>;
  isReadOnly: boolean;
};

export const RunStatusBar: React.FC<RunStatusBarProps> = ({
  run,
  onCancel,
  onReplayAll,
  isReadOnly,
}) => {
  const [cancelling, setCancelling] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const isActive = ['PENDING', 'QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(run.status.toUpperCase());
  const isTerminal = ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.status.toUpperCase());

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cooperatively terminate this active workflow execution?')) {
      setCancelling(true);
      try {
        await onCancel();
      } finally {
        setCancelling(false);
      }
    }
  };

  const handleReplayAll = async () => {
    if (window.confirm('Are you sure you want to replay this workflow execution from the beginning?')) {
      setReplaying(true);
      try {
        await onReplayAll();
      } finally {
        setReplaying(false);
      }
    }
  };

  return (
    <div className="flex flex-col justify-between gap-5 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 select-none sm:flex-row sm:items-center">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Execution Flow
          </span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
            Run ID: {run.id}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="font-sans text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
            {run.workflowName}
          </h2>
          <span className="font-sans text-xs text-[var(--text-muted)] select-none">/</span>
          <StepStatusBadge status={run.status} />
          {run.originalRunId && (
            <>
              <span className="font-sans text-xs text-[var(--text-muted)] select-none">/</span>
              <span className="rounded-[var(--radius-sm)] border border-[var(--accent-primary-border)] bg-[var(--accent-primary-subtle)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--accent-primary)]">
                Replayed from {run.originalRunId.substring(0, 8)}
              </span>
            </>
          )}
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex shrink-0 items-center gap-2.5">
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-action)] px-4 py-2 font-sans text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--danger-action-hover)] disabled:opacity-50"
            >
              <Ban className={`h-3.5 w-3.5 ${cancelling ? 'animate-pulse' : ''}`} />
              Cancel Run
            </button>
          )}

          {isTerminal && (
            <button
              onClick={handleReplayAll}
              disabled={replaying}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 font-sans text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${replaying ? 'animate-spin' : ''}`} />
              Replay From Start
            </button>
          )}
        </div>
      )}
    </div>
  );
};
