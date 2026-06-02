import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { useGlobalSSE } from '../../hooks/useSSE.ts';

type LogLine = {
  id: string;
  time: string;
  level: 'INFO' | 'CLAIM' | 'OK' | 'WARN' | 'ERROR';
  message: string;
};

export const LiveEventStream: React.FC = () => {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const getFormattedTime = () => {
    const d = new Date();
    return d.toLocaleTimeString(undefined, { hour12: false });
  };

  const addLog = (level: LogLine['level'], message: string) => {
    const newLine: LogLine = {
      id: Math.random().toString(36).substring(2, 9),
      time: getFormattedTime(),
      level,
      message,
    };
    setLogs((prev) => [...prev.slice(-30), newLine]);
  };

  useGlobalSSE((event) => {
    const runAbbrev = event.workflowRunId ? `(run_${event.workflowRunId.substring(0, 6)})` : '';
    const stepAbbrev = event.stepKey || event.stepId || '';

    switch (event.type) {
      case 'run.trigger':
        addLog('INFO', `Workflow triggered: ${event.status} ${runAbbrev}`);
        break;
      case 'step.queued':
        addLog('INFO', `Step enqueued: ${stepAbbrev} ${runAbbrev}`);
        break;
      case 'step.started':
        addLog('CLAIM', `Step claimed: ${stepAbbrev}`);
        break;
      case 'step.succeeded':
        addLog('OK', `Step succeeded: ${stepAbbrev} ${runAbbrev}`);
        break;
      case 'step.failed':
        addLog('ERROR', `Step execution failed: ${stepAbbrev} [Attempt ${event.attempt || 1}]`);
        break;
      case 'step.retrying':
        addLog('WARN', `Retrying step: ${stepAbbrev}`);
        break;
      case 'step.dead_lettered':
        addLog('ERROR', `Step dead-lettered: ${stepAbbrev} ${runAbbrev}`);
        break;
      case 'workflow.completed':
        addLog('OK', `Workflow completed ${runAbbrev}`);
        break;
      case 'workflow.failed':
        addLog('ERROR', `Workflow failed ${runAbbrev}`);
        break;
    }
  });

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (lvl: LogLine['level']) => {
    switch (lvl) {
      case 'INFO': return 'text-[var(--log-info)]';
      case 'CLAIM': return 'text-[var(--state-running-text)]';
      case 'OK': return 'text-[var(--state-succeeded-text)]';
      case 'WARN': return 'text-[var(--log-warn)]';
      case 'ERROR': return 'text-[var(--log-error)]';
      default: return 'text-[var(--text-secondary)]';
    }
  };

  return (
    <div className="relative flex h-[280px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] select-none">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-[var(--accent-primary)]" strokeWidth={2} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            flowforge://gateway/event-stream
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden bg-[var(--bg-base)] p-4 font-mono text-[11px] leading-relaxed text-[var(--text-mono)]"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
            Waiting for live SSE events from the API gateway.
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--bg-surface-hover)]">
              <span className="shrink-0 font-medium text-[var(--text-muted)]">{log.time}</span>
              <span className={`min-w-[50px] shrink-0 text-right font-bold uppercase ${getLevelColor(log.level)}`}>
                [{log.level}]
              </span>
              <span className="break-all font-medium text-[var(--text-primary)]">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
