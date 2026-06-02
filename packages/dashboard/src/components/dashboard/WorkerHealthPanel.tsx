import React from 'react';
import { Activity, Cpu, ShieldAlert, Terminal } from 'lucide-react';

type WorkerHealthPanelProps = {
  activeWorkers: number;
  queueDepth: number;
};

export const WorkerHealthPanel: React.FC<WorkerHealthPanelProps> = ({
  activeWorkers,
  queueDepth,
}) => {
  const isHealthy = activeWorkers > 0;
  const isWarning = activeWorkers === 0 && queueDepth > 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 select-none">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              isHealthy
                ? 'bg-[var(--state-succeeded-text)]'
                : isWarning
                  ? 'bg-[var(--state-cancel-req-text)]'
                  : 'bg-[var(--text-muted)]'
            }`}
          />
          <h3 className="flex items-center gap-1.5 font-sans text-[var(--text-md)] font-semibold text-[var(--text-primary)]">
            {isWarning ? (
              <ShieldAlert className="h-4 w-4 text-[var(--state-cancel-req-text)]" />
            ) : (
              <Cpu className="h-4 w-4 text-[var(--accent-primary)]" />
            )}
            Worker Cluster
          </h3>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
          <Activity className="h-3 w-3 text-[var(--accent-primary)]" />
          Derived from current run state
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        {isHealthy ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--state-succeeded-border)] bg-[var(--state-succeeded-bg)] p-3">
            <div className="font-sans text-[var(--text-sm)] font-medium text-[var(--state-succeeded-text)]">
              {activeWorkers} worker{activeWorkers === 1 ? '' : 's'} currently executing steps.
            </div>
            <p className="mt-1 font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
              Worker identity appears on individual step runs when the API reports it.
            </p>
          </div>
        ) : isWarning ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--state-cancel-req-border)] bg-[var(--state-cancel-req-bg)] p-3 text-[var(--state-cancel-req-text)]">
            <div className="flex gap-2 font-sans text-[var(--text-xs)] leading-relaxed">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Queue contains {queueDepth} pending step{queueDepth === 1 ? '' : 's'}, but no worker is currently executing.
              </span>
            </div>
          </div>
        ) : (
          <div className="font-sans text-xs text-[var(--text-secondary)]">
            No active workers are executing steps right now.
          </div>
        )}

        {!isHealthy && (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
              <span>Terminal CLI Node Launcher</span>
              <Terminal className="h-3 w-3" />
            </div>
            <div className="p-3.5 font-mono text-[10px] leading-relaxed text-[var(--text-mono)]">
              <p className="text-[var(--text-muted)]"># Start a local task daemon:</p>
              <p className="mt-1.5 text-[var(--accent-primary)]">
                $ <span className="font-bold text-[var(--text-primary)]">npm run dev:worker</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
