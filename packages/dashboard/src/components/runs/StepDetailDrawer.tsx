import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Cpu, FileJson, Play, RefreshCw, Terminal, X } from 'lucide-react';
import { StepStatusBadge } from './StepStatusBadge.tsx';
import { LogViewer } from './LogViewer.tsx';
import type { StepRunDto } from '../../api/runs.ts';

type StepDetailDrawerProps = {
  step: StepRunDto;
  onClose: () => void;
  onRetry: (stepRunId: string) => Promise<void>;
  onReplay: (stepKey: string) => Promise<void>;
  isReadOnly: boolean;
};

export const StepDetailDrawer: React.FC<StepDetailDrawerProps> = ({
  step,
  onClose,
  onRetry,
  onReplay,
  isReadOnly,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry(step.id);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    try {
      await onReplay(step.stepKey);
    } finally {
      setIsReplaying(false);
    }
  };

  const isTerminal = ['SUCCEEDED', 'FAILED', 'DEAD_LETTERED', 'CANCELLED'].includes(step.status.toUpperCase());
  const canRetry = step.status.toUpperCase() === 'DEAD_LETTERED' || step.status.toUpperCase() === 'FAILED';
  const isCurrentlyRunning = ['RUNNING', 'RETRYING', 'QUEUED'].includes(step.status.toUpperCase());

  return (
    <div className="fixed bottom-0 right-0 top-12 z-40 flex h-[calc(100vh-48px)] w-full max-w-[400px] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface-raised)] select-none animate-[slideInRight_0.2s_ease-out]">
      <div className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Step Details
          </span>
          <h2 className="mt-1 max-w-[260px] break-all font-mono text-sm font-semibold text-[var(--text-primary)]">
            {step.stepKey}
          </h2>
          <span className="mt-0.5 break-all font-mono text-[10px] text-[var(--text-secondary)]">
            Handler: {step.handlerName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <StepStatusBadge status={step.status} />
          <button
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-md)] border border-transparent p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Clock className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Attempts
            </span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2 py-0.5 font-bold text-[var(--text-primary)]">
              {step.attemptCount} / {step.maxAttempts}
            </span>
          </div>

          {step.workerId && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 font-mono text-xs">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Cpu className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                Worker Node
              </span>
              <span className="max-w-[180px] truncate rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2 py-0.5 text-[var(--text-mono)]" title={step.workerId}>
                {step.workerId}
              </span>
            </div>
          )}

          {step.startedAt && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 font-mono text-xs">
              <span className="text-[var(--text-secondary)]">Started At</span>
              <span className="font-medium text-[var(--text-muted)]">
                {new Date(step.startedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {step.completedAt && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 font-mono text-xs">
              <span className="text-[var(--text-secondary)]">Completed At</span>
              <span className="font-medium text-[var(--text-muted)]">
                {new Date(step.completedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <button
            onClick={() => setShowInput(!showInput)}
            className="flex w-full cursor-pointer items-center justify-between p-3.5 font-sans text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <FileJson className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              Input Config Parameters
            </span>
            {showInput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {showInput && (
            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
              <pre className="max-h-[180px] overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-3 font-mono text-[10px] text-[var(--text-mono)] select-text">
                {JSON.stringify(step.inputPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {step.status.toUpperCase() === 'SUCCEEDED' && step.outputPayload && (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="flex w-full cursor-pointer items-center justify-between p-3.5 font-sans text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
            >
              <span className="flex items-center gap-2">
                <FileJson className="h-3.5 w-3.5 text-[var(--state-succeeded-text)]" />
                Output Execution Results
              </span>
              {showOutput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {showOutput && (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
                <pre className="max-h-[180px] overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-3 font-mono text-[10px] text-[var(--text-mono)] select-text">
                  {JSON.stringify(step.outputPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {(step.status.toUpperCase() === 'FAILED' || step.status.toUpperCase() === 'DEAD_LETTERED') && step.errorMessage && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4">
            <span className="w-fit rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--danger-text)]">
              Execution Error
            </span>
            <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)] select-text">
              {step.errorMessage}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <span className="flex w-fit items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] select-none">
            <Terminal className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Step Console Telemetry
          </span>
          <LogViewer stepRunId={step.id} isActive={isCurrentlyRunning} />
        </div>
      </div>

      {!isReadOnly && isTerminal && (
        <div className="flex shrink-0 gap-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              Retry Failed Step
            </button>
          )}

          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${isReplaying ? 'animate-pulse' : ''}`} />
            Replay From Here
          </button>
        </div>
      )}
    </div>
  );
};
