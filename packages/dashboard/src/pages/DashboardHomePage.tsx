import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Clock, Cpu, LayoutDashboard, ListOrdered, ShieldAlert } from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard.tsx';
import { MetricCardGrid } from '../components/dashboard/MetricCardGrid.tsx';
import { WorkerHealthPanel } from '../components/dashboard/WorkerHealthPanel.tsx';
import { RecentRunsTable } from '../components/dashboard/RecentRunsTable.tsx';
import { LiveEventStream } from '../components/dashboard/LiveEventStream.tsx';
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
    failureRate: 0,
  });
  const [runs, setRuns] = useState<RunSummaryDto[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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

  const loadRuns = async (showLoading = false) => {
    if (showLoading) setLoadingRuns(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getRuns(token, 1, 20, selectedStatus, fromDate, toDate);
      setRuns(data.items);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow runs');
    } finally {
      if (showLoading) setLoadingRuns(false);
    }
  };

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

  useGlobalSSE((event) => {
    if (
      event.type === 'workflow.completed' ||
      event.type === 'workflow.failed' ||
      event.type === 'workflow.cancelled' ||
      event.type === 'run.trigger'
    ) {
      setRuns((prevRuns) =>
        prevRuns.map((run) =>
          run.id === event.workflowRunId ? { ...run, status: event.status } : run,
        ),
      );
      loadStats();
    }
  }, () => {
    loadStats();
    loadRuns(false);
  });

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-sans text-[var(--text-xl)] font-semibold text-[var(--text-primary)]">
            <LayoutDashboard className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
            Telemetry Console
          </h1>
          <p className="mt-1 font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
            Queue depth, worker activity, recent job runs, and live gateway events.
          </p>
        </div>
      </div>

      {(stats.dlqDepth > 0 || stats.failureRate > 0) && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 animate-[slideIn_0.3s_ease-out]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger-text)]" />
          <div className="flex w-full flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--danger-text)]">
                Operational warning
              </span>
              <span className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--danger-text)]">
                {stats.dlqDepth} DLQ active
              </span>
            </div>
            <p className="mt-1.5 font-sans text-xs leading-relaxed text-[var(--text-primary)]">
              Dead-lettered or failed executions are present. Review the affected runs before retrying or replaying.
            </p>
          </div>
        </div>
      )}

      <MetricCardGrid>
        <MetricCard
          label="Queue Depth"
          value={stats.queueDepth}
          icon={<ListOrdered />}
          color="var(--state-queued-text)"
          description="Steps waiting to be claimed"
        />
        <MetricCard
          label="Active Workers"
          value={stats.activeWorkers}
          icon={<Cpu />}
          color="var(--state-running-text)"
          description="Workers currently executing steps"
        />
        <MetricCard
          label="Jobs Last Hour"
          value={stats.jobsLastHour}
          icon={<Clock />}
          color="var(--state-succeeded-text)"
          description="Succeeded job steps in the last hour"
        />
        <MetricCard
          label="Failure Rate"
          value={`${(stats.failureRate * 100).toFixed(1)}%`}
          icon={<ShieldAlert />}
          color={stats.dlqDepth > 0 ? 'var(--state-dlq-text)' : 'var(--text-muted)'}
          description={`${stats.dlqDepth} terminal DLQ step${stats.dlqDepth === 1 ? '' : 's'} active`}
        />
      </MetricCardGrid>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <WorkerHealthPanel activeWorkers={stats.activeWorkers} queueDepth={stats.queueDepth} />

          <div className="flex flex-col gap-3">
            <h2 className="font-sans text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
              Recent Workflow Executions
            </h2>
            {error ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 font-sans text-xs text-[var(--danger-text)]">
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

        <div className="flex flex-col gap-4 lg:col-span-4">
          <h2 className="flex items-center gap-2 font-sans text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
            Real-Time Gateway
          </h2>
          <LiveEventStream />
        </div>
      </div>
    </div>
  );
}
