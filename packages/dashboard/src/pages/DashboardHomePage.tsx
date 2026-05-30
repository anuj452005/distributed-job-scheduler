import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { LayoutDashboard, Cpu, Clock, ShieldAlert, ListOrdered } from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard.tsx';
import { MetricCardGrid } from '../components/dashboard/MetricCardGrid.tsx';
import { WorkerHealthPanel } from '../components/dashboard/WorkerHealthPanel.tsx';
import { RecentRunsTable } from '../components/dashboard/RecentRunsTable.tsx';
import { getStats } from '../api/stats.ts';
import { getRuns } from '../api/runs.ts';
import { useGlobalSSE } from '../hooks/useSSE.ts';
import type { StatsDto } from '../api/stats.ts';
import type { RunSummaryDto } from '../api/runs.ts';

export default function DashboardHomePage() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<StatsDto>({
    queueDepth: 0,
    activeWorkers: 0,
    dlqDepth: 0,
    jobsLastHour: 0,
    failureRate: 0.0,
  });
  const [runs, setRuns] = useState<RunSummaryDto[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // 1. Fetch system stats aggregates
  const loadStats = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getStats(token);
      setStats(data);
    } catch (err) {
      console.error('Failed to load telemetry stats', err);
    }
  };

  // 2. Fetch recent runs list (up to 20 items, sorted by createdAt DESC)
  const loadRuns = async (showLoading = false) => {
    if (showLoading) setLoadingRuns(true);
    try {
      const token = await getToken();
      if (!token) return;
      // Fetch runs list with active status and date filters
      const data = await getRuns(token, 1, 20, selectedStatus, fromDate, toDate);
      setRuns(data.items);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch active job worker runs');
    } finally {
      if (showLoading) setLoadingRuns(false);
    }
  };

  // 3. Trigger initial loads and setup background interval polling (refresh stats every 30s, runs every 60s)
  useEffect(() => {
    loadStats();
    loadRuns(true);

    const statsInterval = setInterval(loadStats, 30_000);
    const runsInterval = setInterval(() => loadRuns(false), 60_000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(runsInterval);
    };
  }, [selectedStatus, fromDate, toDate]);

  // 4. SSE Subscription for Real-time run status updates without full table page refresh
  useGlobalSSE((event) => {
    // If the event represents a workflow run status change, update the matching run row status!
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

      // Re-fetch stats as terminal events affect aggregates
      loadStats();
    }
  }, () => {
    // On SSE gateway reconnect / reset, trigger REST re-fetch of stats and runs list
    loadStats();
    loadRuns(false);
  });

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
            Telemetry Console
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Real-time telemetry, queue depth aggregates, worker health checks, and recent job runs.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-[var(--state-succeeded-bg)] border border-[var(--state-succeeded-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--state-succeeded-text)] shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--state-succeeded-text)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--state-succeeded-text)]"></span>
          </span>
          System Operational
        </div>
      </div>

      {/* Stats Cards Dashboard Grid */}
      <MetricCardGrid>
        <MetricCard
          label="Queue Depth"
          value={stats.queueDepth}
          icon={<ListOrdered />}
          color="var(--state-queued-text)"
          description="Pending steps waiting in queue"
        />
        <MetricCard
          label="Active Workers"
          value={stats.activeWorkers}
          icon={<Cpu />}
          color="var(--state-running-text)"
          description="Nodes claiming executing steps"
        />
        <MetricCard
          label="Jobs Last Hour"
          value={stats.jobsLastHour}
          icon={<Clock />}
          color="var(--state-succeeded-text)"
          description="Succeeded job steps in last 1 hour"
        />
        <MetricCard
          label="Failure Rate"
          value={`${(stats.failureRate * 100).toFixed(1)}%`}
          icon={<ShieldAlert />}
          color={stats.dlqDepth > 0 ? 'var(--state-dlq-text)' : 'var(--text-muted)'}
          description={`${stats.dlqDepth} terminal DLQ steps active`}
        />
      </MetricCardGrid>

      {/* Worker Health panel */}
      <WorkerHealthPanel activeWorkers={stats.activeWorkers} queueDepth={stats.queueDepth} />

      {/* Recent runs list */}
      <div className="flex flex-col gap-3">
        <h2 className="font-sans text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
          Recent Workflow Executions
        </h2>
        {error ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs font-sans">
            {error}
          </div>
        ) : (
          <RecentRunsTable
            runs={runs}
            loading={loadingRuns}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            fromDate={fromDate}
            onFromDateChange={setFromDate}
            toDate={toDate}
            onToDateChange={setToDate}
          />
        )}
      </div>
    </div>
  );
}
