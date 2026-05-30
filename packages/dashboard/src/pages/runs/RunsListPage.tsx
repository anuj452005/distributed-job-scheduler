import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { Play, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { RecentRunsTable } from '../../components/dashboard/RecentRunsTable.tsx';
import { getRuns } from '../../api/runs.ts';
import { useGlobalSSE } from '../../hooks/useSSE.ts';
import type { RunSummaryDto } from '../../api/runs.ts';

export default function RunsListPage() {
  const { getToken } = useAuth();
  const [runs, setRuns] = useState<RunSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pagination States
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadRuns = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getRuns(token, page, limit, selectedStatus, fromDate, toDate);
      setRuns(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve active job queues.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns(true);

    const interval = setInterval(() => {
      loadRuns(false);
    }, 60_000);

    return () => clearInterval(interval);
  }, [page, selectedStatus, fromDate, toDate]);

  // Subscribe to real-time events to update run statuses inside the list dynamically
  useGlobalSSE((event) => {
    if (
      event.type === 'workflow.completed' ||
      event.type === 'workflow.failed' ||
      event.type === 'workflow.cancelled' ||
      event.type === 'run.trigger'
    ) {
      setRuns((prevRuns) =>
        prevRuns.map((run) =>
          run.id === event.workflowRunId
            ? { ...run, status: event.status }
            : run
        )
      );
    }
  }, () => {
    loadRuns(false);
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Play className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
            Execution Runs
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Audit executing worker flows, trace leases, and monitor failure states in real-time.
          </p>
        </div>
        <button
          onClick={() => loadRuns(true)}
          className="cursor-pointer flex items-center gap-1.5 border border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-primary)] font-semibold transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync State
        </button>
      </div>

      {error && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs font-sans">
          {error}
        </div>
      )}

      {/* Runs Table with toolbar */}
      <RecentRunsTable
        runs={runs}
        loading={loading}
        selectedStatus={selectedStatus}
        onStatusChange={(status) => {
          setSelectedStatus(status);
          setPage(1);
        }}
        fromDate={fromDate}
        onFromDateChange={(date) => {
          setFromDate(date);
          setPage(1);
        }}
        toDate={toDate}
        onToDateChange={(date) => {
          setToDate(date);
          setPage(1);
        }}
      />

      {/* Pagination controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
          <span className="font-sans text-[11px] text-[var(--text-secondary)]">
            Showing <span className="font-mono font-bold text-[var(--text-primary)]">{runs.length}</span> of <span className="font-mono font-bold text-[var(--text-primary)]">{total}</span> runs
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="cursor-pointer p-1.5 border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] rounded-[var(--radius-md)] text-[var(--text-secondary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-[var(--text-primary)] px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="cursor-pointer p-1.5 border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] rounded-[var(--radius-md)] text-[var(--text-secondary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
