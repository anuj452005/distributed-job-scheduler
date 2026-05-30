import { useState } from 'react';
import { Ban, RefreshCw } from 'lucide-react';
import { StepStatusBadge } from './StepStatusBadge.tsx';
import type { WorkflowRunDetailDto } from '../../api/runs.ts';

interface RunStatusBarProps {
  run: WorkflowRunDetailDto;
  onCancel: () => Promise<void>;
  onReplayAll: () => Promise<void>;
  isReadOnly: boolean;
}

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
      } catch (err) {
        console.error(err);
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
      } catch (err) {
        console.error(err);
      } finally {
        setReplaying(false);
      }
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
      {/* Title / Info */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="font-sans text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
            Execution Flow
          </span>
          <span className="font-mono text-xs text-[var(--text-secondary)]">
            Run ID: {run.id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
          <h2 className="font-sans text-[var(--text-lg)] font-bold text-[var(--text-primary)]">
            {run.workflowName}
          </h2>
          <span className="text-[var(--text-muted)] font-sans text-xs">•</span>
          <StepStatusBadge status={run.status} />
          {run.originalRunId && (
            <>
              <span className="text-[var(--text-muted)] font-sans text-xs">•</span>
              <span className="font-mono text-[10px] text-[var(--accent-primary)] bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] px-2 py-0.5 rounded">
                Replayed from {run.originalRunId.substring(0, 8)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Operator controls */}
      {!isReadOnly && (
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="cursor-pointer py-1.5 px-3 bg-[var(--danger-action)] hover:bg-[var(--danger-action-hover)] disabled:bg-opacity-50 text-[var(--text-primary)] border border-[var(--danger-border)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center gap-1.5 shadow transition-all"
            >
              <Ban className={`h-3.5 w-3.5 ${cancelling ? 'animate-pulse' : ''}`} />
              Cancel Run
            </button>
          )}

          {isTerminal && (
            <button
              onClick={handleReplayAll}
              disabled={replaying}
              className="cursor-pointer py-1.5 px-3 border border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] disabled:bg-opacity-50 text-[var(--text-primary)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center gap-1.5 transition-all"
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
