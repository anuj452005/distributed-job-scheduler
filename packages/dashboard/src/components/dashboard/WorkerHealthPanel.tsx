import React from 'react';
import { ShieldAlert, Activity } from 'lucide-react';

interface WorkerHealthPanelProps {
  activeWorkers: number;
  queueDepth: number;
}

export const WorkerHealthPanel: React.FC<WorkerHealthPanelProps> = ({
  activeWorkers,
  queueDepth,
}) => {
  const isHealthy = activeWorkers > 0;
  const isWarning = activeWorkers === 0 && queueDepth > 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isHealthy ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--state-succeeded-text)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--state-succeeded-text)]"></span>
              </span>
              <span className="font-sans text-xs font-semibold text-[var(--text-primary)]">
                {activeWorkers} {activeWorkers === 1 ? 'Worker' : 'Workers'} Active
              </span>
            </div>
          ) : isWarning ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--state-cancel-req-text)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--state-cancel-req-text)]"></span>
              </span>
              <span className="font-sans text-xs font-semibold text-[var(--state-cancel-req-text)] flex items-center gap-1.5 animate-pulse">
                <ShieldAlert className="h-3.5 w-3.5" />
                Orphaned Queue State Detected
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]"></span>
              <span className="font-sans text-xs font-semibold text-[var(--text-secondary)]">
                System Idle (0 active workers)
              </span>
            </div>
          )}
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          Status Heartbeat Engine
        </div>
      </div>

      {isWarning && (
        <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--state-cancel-req-bg)] border border-[var(--state-cancel-req-border)] p-2.5 text-[11px] text-[var(--state-cancel-req-text)] font-sans leading-relaxed">
          <strong>Warning:</strong> The scheduling queue contains pending jobs ({queueDepth}), but no active workers are available. Verify that the task consumer nodes are currently operational and registered.
        </div>
      )}
    </div>
  );
};
