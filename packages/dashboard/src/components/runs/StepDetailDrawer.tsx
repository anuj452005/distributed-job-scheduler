import React, { useState } from 'react';
import { X, Play, RefreshCw, Cpu, Clock, Terminal, ChevronDown, ChevronRight, FileJson } from 'lucide-react';
import { StepStatusBadge } from './StepStatusBadge.tsx';
import { LogViewer } from './LogViewer.tsx';
import type { StepRunDto } from '../../api/runs.ts';

interface StepDetailDrawerProps {
  step: StepRunDto;
  onClose: () => void;
  onRetry: (stepRunId: string) => Promise<void>;
  onReplay: (stepKey: string) => Promise<void>;
  isReadOnly: boolean;
}

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
    } catch (err) {
      console.error(err);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    try {
      await onReplay(step.stepKey);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReplaying(false);
    }
  };

  const isTerminal = ['SUCCEEDED', 'FAILED', 'DEAD_LETTERED', 'CANCELLED'].includes(step.status.toUpperCase());
  const canRetry = step.status.toUpperCase() === 'DEAD_LETTERED' || step.status.toUpperCase() === 'FAILED';
  const isCurrentlyRunning = ['RUNNING', 'RETURING', 'QUEUED'].includes(step.status.toUpperCase());

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[400px] bg-[var(--bg-surface-raised)] border-l border-[var(--border-strong)] flex flex-col shadow-2xl animate-[slideInRight_0.2s_ease-out] select-none h-screen mt-[48px] pb-[48px]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-surface)]">
        <div className="flex flex-col gap-1">
          <span className="font-sans text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
            Step Details
          </span>
          <h2 className="font-mono text-[var(--text-md)] font-bold text-[var(--text-primary)] break-all max-w-[280px]">
            {step.stepKey}
          </h2>
          <span className="font-mono text-[10px] text-[var(--text-secondary)] break-all">
            Handler: {step.handlerName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepStatusBadge status={step.status} />
          <button
            onClick={onClose}
            className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] p-1 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Metadata section */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Attempts
            </span>
            <span className="text-[var(--text-primary)] font-bold">
              {step.attemptCount} / {step.maxAttempts}
            </span>
          </div>

          {step.workerId && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-[var(--border-subtle)] pt-2.5">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                Worker Node
              </span>
              <span className="text-[var(--text-mono)] max-w-[200px] truncate" title={step.workerId}>
                {step.workerId}
              </span>
            </div>
          )}

          {step.startedAt && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-[var(--border-subtle)] pt-2.5">
              <span className="text-[var(--text-secondary)]">Started At</span>
              <span className="text-[var(--text-muted)]">
                {new Date(step.startedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {step.completedAt && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-[var(--border-subtle)] pt-2.5">
              <span className="text-[var(--text-secondary)]">Completed At</span>
              <span className="text-[var(--text-muted)]">
                {new Date(step.completedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        {/* Input Payload Accordion */}
        <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden">
          <button
            onClick={() => setShowInput(!showInput)}
            className="cursor-pointer w-full bg-[var(--bg-surface)] p-3 flex items-center justify-between text-xs font-sans font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <FileJson className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              Input Config Parameters
            </span>
            {showInput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {showInput && (
            <div className="bg-[var(--bg-base)] p-3 border-t border-[var(--border-default)]">
              <pre className="font-mono text-[10px] text-[var(--text-mono)] overflow-x-auto max-h-[160px] p-2 rounded bg-black/40">
                {JSON.stringify(step.inputPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Output Payload Accordion (Succeeded only) */}
        {step.status.toUpperCase() === 'SUCCEEDED' && step.outputPayload && (
          <div className="border border-[var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden">
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="cursor-pointer w-full bg-[var(--bg-surface)] p-3 flex items-center justify-between text-xs font-sans font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <FileJson className="h-3.5 w-3.5 text-[var(--state-succeeded-text)]" />
                Output Execution Results
              </span>
              {showOutput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {showOutput && (
              <div className="bg-[var(--bg-base)] p-3 border-t border-[var(--border-default)]">
                <pre className="font-mono text-[10px] text-[var(--text-mono)] overflow-x-auto max-h-[160px] p-2 rounded bg-black/40">
                  {JSON.stringify(step.outputPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error Block */}
        {(step.status.toUpperCase() === 'FAILED' || step.status.toUpperCase() === 'DEAD_LETTERED') && step.errorMessage && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 flex flex-col gap-1.5">
            <span className="font-sans text-[10px] font-bold text-[var(--danger-text)] uppercase tracking-wider">
              Execution Error
            </span>
            <p className="font-mono text-xs text-[var(--text-primary)] break-words leading-relaxed whitespace-pre-wrap">
              {step.errorMessage}
            </p>
          </div>
        )}

        {/* Structured Log Terminal */}
        <div className="flex flex-col gap-2">
          <span className="font-sans text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5 select-none">
            <Terminal className="h-3.5 w-3.5" />
            Step Console Telemetry
          </span>
          <LogViewer stepRunId={step.id} isActive={isCurrentlyRunning} />
        </div>
      </div>

      {/* Action Footer (Sticky) */}
      {!isReadOnly && isTerminal && (
        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex gap-2 shrink-0">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="cursor-pointer flex-1 py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] disabled:bg-opacity-50 text-[var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center justify-center gap-1.5 shadow transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              Retry Failed Step
            </button>
          )}

          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="cursor-pointer flex-1 py-2 px-3 border border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] disabled:bg-opacity-50 text-[var(--text-primary)] rounded-[var(--radius-md)] text-xs font-semibold font-sans flex items-center justify-center gap-1.5 transition-all"
          >
            <Play className={`h-3.5 w-3.5 ${isReplaying ? 'animate-pulse' : ''}`} />
            Replay From Here
          </button>
        </div>
      )}
    </div>
  );
};
