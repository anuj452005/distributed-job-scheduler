import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '@clerk/react';
import { apiClient } from '../../api/client.ts';

export interface LogLineDto {
  id: string;
  level: string;
  message: string;
  metadata: any;
  createdAt: string;
}

interface LogViewerProps {
  stepRunId: string;
  isActive: boolean; // Is step currently running, to trigger auto-polling/refreshing logs
}

export const LogViewer: React.FC<LogViewerProps> = ({ stepRunId, isActive }) => {
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<LogLineDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualizer for high-performance rendering of potentially thousands of log lines
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  useEffect(() => {
    let active = true;
    let pollInterval: any = null;

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
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to fetch logs');
        }
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };

    fetchLogs(true);

    // If step is active (running/queued/retrying), poll for logs every 2 seconds
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

  // Scroll to bottom on initial load or when new logs arrive (if user was already at bottom)
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
        return 'text-[var(--log-debug)]';
      case 'WARN':
      case 'WARNING':
        return 'text-[var(--log-warn)]';
      case 'ERROR':
      case 'FATAL':
        return 'text-[var(--log-error)]';
      case 'INFO':
      default:
        return 'text-[var(--log-info)]';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-default)] select-none">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-2"></div>
        <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">Syncing logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-4 bg-[var(--danger-bg)] text-[var(--danger-text)] rounded-[var(--radius-md)] border border-[var(--danger-border)] text-xs font-sans select-none">
        Failed to fetch logs: {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-default)] text-center select-none">
        <span className="text-xs text-[var(--text-muted)] font-sans">
          No logs recorded for this execution step.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 font-mono text-[11px] leading-relaxed max-h-[300px]"
    >
      <div
        className="w-full relative"
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
              className="absolute top-0 left-0 w-full flex items-start gap-2 py-0.5 hover:bg-[var(--bg-surface-hover)] px-1 rounded transition-colors whitespace-pre-wrap break-all"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <span className="text-[var(--text-muted)] select-none text-[10px] shrink-0">{time}</span>
              <span className="text-[var(--border-strong)] select-none">|</span>
              <span className={`font-bold shrink-0 uppercase w-10 text-right select-none ${getLogLevelStyle(log.level)}`}>
                {log.level}
              </span>
              <span className="text-[var(--border-strong)] select-none">|</span>
              <span className="text-[var(--text-mono)] flex-1">{log.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
