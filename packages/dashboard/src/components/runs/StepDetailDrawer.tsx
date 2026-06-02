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
    <div className="fixed top-12 bottom-0 right-0 z-40 w-full max-w-[400px] bg-[var(--bg-surface-raised)]/95 backdrop-blur-md border-l border-white/[0.04] flex flex-col shadow-2xl animate-[slideInRight_0.2s_ease-out] select-none h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="p-5 border-b border-white/[0.04] flex items-center justify-between bg-black/20 backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <span className="font-sans text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded w-fit">
            Step Details
          </span>
          <h2 className="font-mono text-sm font-extrabold text-[var(--text-primary)] break-all max-w-[260px] tracking-tight mt-1">
            {step.stepKey}
          </h2>
          <span className="font-mono text-[10px] text-[var(--text-secondary)] break-all mt-0.5">
            Handler: {step.handlerName}
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <StepStatusBadge status={step.status} />
          <button
            onClick={onClose}
            className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.05] p-1.5 rounded-lg transition-colors border border-transparent hover:border-white/[0.03]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* Metadata section */}
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 flex flex-col gap-3 shadow-inner">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Attempts
            </span>
            <span className="text-[var(--text-primary)] font-bold bg-white/[0.02] px-2 py-0.5 rounded border border-white/[0.04]">
              {step.attemptCount} / {step.maxAttempts}
            </span>
          </div>

          {step.workerId && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-white/[0.03] pt-3">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                Worker Node
              </span>
              <span className="text-[var(--text-mono)] max-w-[180px] truncate bg-black/20 px-2 py-0.5 rounded border border-white/[0.03]" title={step.workerId}>
                {step.workerId}
              </span>
            </div>
          )}

          {step.startedAt && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-white/[0.03] pt-3">
              <span className="text-[var(--text-secondary)]">Started At</span>
              <span className="text-[var(--text-muted)] font-medium">
                {new Date(step.startedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {step.completedAt && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-white/[0.03] pt-3">
              <span className="text-[var(--text-secondary)]">Completed At</span>
              <span className="text-[var(--text-muted)] font-medium">
                {new Date(step.completedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        {/* Input Payload Accordion */}
        <div className="border border-white/[0.04] rounded-xl overflow-hidden shadow-sm bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
          <button
            onClick={() => setShowInput(!showInput)}
            className="cursor-pointer w-full p-3.5 flex items-center justify-between text-xs font-sans font-semibold text-[var(--text-primary)] transition-all duration-200"
          >
            <span className="flex items-center gap-2">
              <FileJson className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              Input Config Parameters
            </span>
            {showInput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {showInput && (
            <div className="bg-black/35 p-3.5 border-t border-white/[0.03]">
              <pre className="font-mono text-[10px] text-[var(--text-mono)] overflow-x-auto max-h-[180px] p-3 rounded-lg bg-black/55 border border-white/[0.02] shadow-inner select-text">
                {JSON.stringify(step.inputPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Output Payload Accordion (Succeeded only) */}
        {step.status.toUpperCase() === 'SUCCEEDED' && step.outputPayload && (
          <div className="border border-white/[0.04] rounded-xl overflow-hidden shadow-sm bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="cursor-pointer w-full p-3.5 flex items-center justify-between text-xs font-sans font-semibold text-[var(--text-primary)] transition-all duration-200"
            >
              <span className="flex items-center gap-2">
                <FileJson className="h-3.5 w-3.5 text-[var(--state-succeeded-text)]" />
                Output Execution Results
              </span>
              {showOutput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {showOutput && (
              <div className="bg-black/35 p-3.5 border-t border-white/[0.03]">
                <pre className="font-mono text-[10px] text-[var(--text-mono)] overflow-x-auto max-h-[180px] p-3 rounded-lg bg-black/55 border border-white/[0.02] shadow-inner select-text">
                  {JSON.stringify(step.outputPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error Block */}
        {(step.status.toUpperCase() === 'FAILED' || step.status.toUpperCase() === 'DEAD_LETTERED') && step.errorMessage && (
          <div className="rounded-xl border border-[var(--danger-border)]/60 bg-gradient-to-r from-[var(--danger-bg)] to-transparent p-4 flex flex-col gap-2 shadow-[0_4px_12px_rgba(239,68,68,0.1)]">
            <span className="font-sans text-[10px] font-extrabold text-[var(--danger-text)] uppercase tracking-wider bg-black/20 border border-[var(--danger-border)]/30 px-2 py-0.5 rounded w-fit">
              Execution Error
            </span>
            <p className="font-mono text-xs text-[var(--text-primary)] break-words leading-relaxed whitespace-pre-wrap select-text">
              {step.errorMessage}
            </p>
          </div>
        )}

        {/* Structured Log Terminal */}
        <div className="flex flex-col gap-2.5">
          <span className="font-sans text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5 select-none bg-white/[0.02] border border-white/[0.04] px-2.5 py-1 rounded w-fit">
            <Terminal className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Step Console Telemetry
          </span>
          <LogViewer stepRunId={step.id} isActive={isCurrentlyRunning} />
        </div>
      </div>

      {/* Action Footer (Sticky) */}
      {!isReadOnly && isTerminal && (
        <div className="p-5 border-t border-white/[0.04] bg-black/20 backdrop-blur-md flex gap-3 shrink-0 shadow-lg">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="cursor-pointer flex-1 py-2.5 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] disabled:bg-opacity-50 text-[var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold font-sans flex items-center justify-center gap-1.5 shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              Retry Failed Step
            </button>
          )}

          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="cursor-pointer flex-1 py-2.5 px-3 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] disabled:bg-opacity-50 text-[var(--text-primary)] rounded-[var(--radius-md)] text-xs font-bold font-sans flex items-center justify-center gap-1.5 shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className={`h-3.5 w-3.5 ${isReplaying ? 'animate-pulse' : ''}`} />
            Replay From Here
          </button>
        </div>
      )}
    </div>
  );
};
