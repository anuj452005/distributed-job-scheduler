import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '@clerk/react';
import { apiClient } from '../../api/client.ts';

export type LogLineDto = {
  id: string;
  level: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

type LogViewerProps = {
  stepRunId: string;
  isActive: boolean;
};

export const LogViewer: React.FC<LogViewerProps> = ({ stepRunId, isActive }) => {
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<LogLineDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  useEffect(() => {
    let active = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchLogs = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error('Authentication required');
        const data = await apiClient<LogLineDto[]>('GET', `/api/steps/${stepRunId}/logs`, undefined, token);
        if (active) {
          setLogs(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        }
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };

    fetchLogs(true);

    if (isActive) {
      pollInterval = setInterval(() => {
        fetchLogs(false);
      }, 2000);
    }

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [stepRunId, isActive, getToken]);

  const prevLogsLength = useRef(logs.length);
  useEffect(() => {
    if (logs.length > prevLogsLength.current && parentRef.current) {
      const parent = parentRef.current;
      const isAtBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 100;
      if (isAtBottom || prevLogsLength.current === 0) {
        parent.scrollTop = parent.scrollHeight;
      }
    }
    prevLogsLength.current = logs.length;
  }, [logs]);

  const getLogLevelStyle = (level: string) => {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return 'border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--log-debug)]';
      case 'WARN':
      case 'WARNING':
        return 'border-[var(--state-cancel-req-border)] bg-[var(--state-cancel-req-bg)] text-[var(--log-warn)]';
      case 'ERROR':
      case 'FATAL':
        return 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--log-error)]';
      case 'INFO':
      default:
        return 'border-[var(--state-running-border)] bg-[var(--state-running-bg)] text-[var(--log-info)]';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] p-8 select-none">
        <div className="mb-2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Syncing logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 font-sans text-xs text-[var(--danger-text)] select-none">
        Failed to fetch logs: {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] p-8 text-center select-none">
        <span className="font-sans text-xs text-[var(--text-muted)]">
          No logs recorded for this execution step.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="max-h-[300px] flex-1 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] p-3.5 font-mono text-[11px] leading-relaxed text-[var(--text-mono)] select-text"
    >
      <div
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const log = logs[virtualItem.index];
          const time = new Date(log.createdAt).toLocaleTimeString();
          return (
            <div
              key={log.id}
              className="absolute left-0 top-0 flex w-full items-center gap-2.5 whitespace-pre-wrap break-all rounded-[var(--radius-sm)] px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-surface-hover)] select-text"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <span className="shrink-0 font-mono text-[9px] font-medium text-[var(--text-muted)] select-none">{time}</span>
              <span className="font-sans text-[10px] text-[var(--border-strong)] select-none">|</span>
              <span className={`min-w-[48px] shrink-0 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-center font-mono text-[8px] font-bold uppercase tracking-wider select-none ${getLogLevelStyle(log.level)}`}>
                {log.level.substring(0, 5)}
              </span>
              <span className="font-sans text-[10px] text-[var(--border-strong)] select-none">|</span>
              <span className="flex-1 text-[var(--text-mono)] selection:bg-[var(--accent-primary-subtle)] selection:text-[var(--text-primary)]">
                {log.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
