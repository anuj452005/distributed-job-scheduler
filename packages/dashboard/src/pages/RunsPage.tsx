import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { Play, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';

interface StepRun {
  id: string;
  stepKey: string;
  handlerName: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
}

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  triggeredBy: string;
  createdAt: string;
  completedAt?: string;
  steps?: StepRun[];
}

export default function RunsPage() {
  const { getToken } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api`;

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/runs?page=1&limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: Failed to fetch active runs`);
      }
      const data = await res.json();
      setRuns(data.data?.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve active job queues.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return 'bg-[var(--state-pending-bg)] text-[var(--state-pending-text)] border-[var(--state-pending-border)]';
      case 'QUEUED':
        return 'bg-[var(--state-queued-bg)] text-[var(--state-queued-text)] border-[var(--state-queued-border)]';
      case 'RUNNING':
        return 'bg-[var(--state-running-bg)] text-[var(--state-running-text)] border-[var(--state-running-border)]';
      case 'SUCCEEDED':
      case 'COMPLETED':
        return 'bg-[var(--state-succeeded-bg)] text-[var(--state-succeeded-text)] border-[var(--state-succeeded-border)]';
      case 'FAILED':
        return 'bg-[var(--state-failed-bg)] text-[var(--state-failed-text)] border-[var(--state-failed-border)]';
      case 'RETRYING':
        return 'bg-[var(--state-retrying-bg)] text-[var(--state-retrying-text)] border-[var(--state-retrying-border)]';
      case 'DEAD_LETTERED':
        return 'bg-[var(--state-dlq-bg)] text-[var(--state-dlq-text)] border-[var(--state-dlq-border)]';
      case 'CANCELLED':
        return 'bg-[var(--state-cancelled-bg)] text-[var(--state-cancelled-text)] border-[var(--state-cancelled-border)]';
      default:
        return 'bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]';
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Play className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={2} />
            Execution Runs
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Audit executing worker flows, trace leases, and monitor failure states in real-time.
          </p>
        </div>
        <Button 
          onClick={fetchRuns}
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1.5 border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync State
        </Button>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 flex flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
          <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Syncing executions...</span>
        </div>
      ) : error ? (
        <div className="flex max-w-2xl items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-[var(--danger-text)]">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <h4 className="font-sans text-sm font-semibold">Connection Refused</h4>
            <p className="font-sans text-xs text-[var(--text-secondary)]">{error}</p>
            <Button onClick={fetchRuns} variant="outline" size="xs" className="mt-3 w-fit border-[var(--danger-border)] hover:bg-[var(--bg-surface-hover)]">
              Reconnect
            </Button>
          </div>
        </div>
      ) : runs.length === 0 ? (
        /* Empty State */
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-16 flex flex-col items-center justify-center text-center max-w-3xl mx-auto w-full relative overflow-hidden group">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-surface-hover)]">
            <Play className="h-6 w-6 text-[var(--text-secondary)]" strokeWidth={1.5} />
          </div>
          <h3 className="font-sans text-[var(--text-lg)] font-bold text-[var(--text-primary)] mb-2">
            No Active or Past Executions
          </h3>
          <p className="font-sans text-[var(--text-sm)] text-[var(--text-secondary)] max-w-md">
            Once workflows are triggered, their active steps and live worker telemetry states will populate here automatically.
          </p>
        </div>
      ) : (
        /* Runs list */
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)] select-none">
                  <th className="p-3 text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Run ID / Workflow</th>
                  <th className="p-3 text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-center">Status</th>
                  <th className="p-3 text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Triggered By</th>
                  <th className="p-3 text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Execution Start</th>
                  <th className="p-3 text-[11px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Completed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors group">
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {run.id.substring(0, 8)}...
                        </span>
                        <span className="font-sans text-[11px] text-[var(--text-secondary)]">
                          {run.workflowName}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider ${getStatusStyle(run.status)}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                        {run.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-xs text-[var(--text-secondary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] px-1.5 py-0.5 rounded">
                        {run.triggeredBy}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-xs text-[var(--text-secondary)]">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 font-sans text-xs text-[var(--text-secondary)]">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : (
                        <span className="text-[var(--text-muted)] italic font-sans">Active Processing...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
