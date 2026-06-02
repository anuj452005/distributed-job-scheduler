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
    <div className="glass-panel rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 select-none shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
      {/* Title / Info */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="font-sans text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded">
            Execution Flow
          </span>
          <span className="font-mono text-xs text-[var(--text-secondary)] bg-black/20 px-2 py-0.5 rounded border border-white/[0.03]">
            Run ID: {run.id}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h2 className="font-sans text-[var(--text-lg)] font-extrabold text-[var(--text-primary)] tracking-tight">
            {run.workflowName}
          </h2>
          <span className="text-[var(--text-muted)] font-sans text-xs select-none">•</span>
          <StepStatusBadge status={run.status} />
          {run.originalRunId && (
            <>
              <span className="text-[var(--text-muted)] font-sans text-xs select-none">•</span>
              <span className="font-mono text-[10px] text-[var(--accent-primary)] bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] px-2.5 py-0.5 rounded-[var(--radius-sm)] shadow-inner">
                Replayed from {run.originalRunId.substring(0, 8)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Operator controls */}
      {!isReadOnly && (
        <div className="flex items-center gap-2.5 shrink-0">
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="cursor-pointer py-2 px-4 bg-[var(--danger-action)] hover:bg-[var(--danger-action-hover)] disabled:bg-opacity-50 text-[var(--text-primary)] border border-[var(--danger-border)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              <Ban className={`h-3.5 w-3.5 ${cancelling ? 'animate-pulse' : ''}`} />
              Cancel Run
            </button>
          )}

          {isTerminal && (
            <button
              onClick={handleReplayAll}
              disabled={replaying}
              className="cursor-pointer py-2 px-4 border border-[var(--border-strong)] bg-white/[0.02] hover:bg-white/[0.06] disabled:bg-opacity-50 text-[var(--text-primary)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center gap-2 shadow-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
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
