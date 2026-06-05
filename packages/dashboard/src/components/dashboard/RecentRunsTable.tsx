import { useNavigate } from 'react-router-dom';
import { StepStatusBadge } from '../runs/StepStatusBadge.tsx';
import { RunStatusFilter } from './RunStatusFilter.tsx';
import { Calendar, Play, Clock, User, ArrowRight } from 'lucide-react';
import type { RunSummaryDto } from '../../api/runs.ts';

const getStatusColor = (s: string) => {
  switch (s.toUpperCase()) {
    case 'PENDING': return 'var(--state-pending-text)';
    case 'QUEUED': return 'var(--state-queued-text)';
    case 'RUNNING':
    case 'CLAIMED': return 'var(--state-running-text)';
    case 'SUCCEEDED':
    case 'COMPLETED': return 'var(--state-succeeded-text)';
    case 'FAILED': return 'var(--state-failed-text)';
    case 'RETRYING': return 'var(--state-retrying-text)';
    case 'DEAD_LETTERED': return 'var(--state-dlq-text)';
    default: return 'var(--border-default)';
  }
};

interface RecentRunsTableProps {
  runs: RunSummaryDto[];
  loading: boolean;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  fromDate: string;
  onFromDateChange: (date: string) => void;
  toDate: string;
  onToDateChange: (date: string) => void;
}

export const RecentRunsTable: React.FC<RecentRunsTableProps> = ({
  runs,
  loading,
  selectedStatus,
  onStatusChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
}) => {
  const navigate = useNavigate();

  const getDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return '—';
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const diffMs = end - start;
    if (diffMs < 0) return '0s';
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    const remainingSecs = diffSecs % 60;
    return remainingSecs > 0 ? `${diffMins}m ${remainingSecs}s` : `${diffMins}m`;
  };

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <RunStatusFilter selectedStatus={selectedStatus} onStatusChange={onStatusChange} />

        {/* Date Filters & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[var(--bg-surface-raised)] border border-[var(--border-default)] rounded-[var(--radius-md)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            <Calendar className="h-3.5 w-3.5" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => onFromDateChange(e.target.value)}
              className="bg-transparent border-none text-[var(--text-primary)] outline-none cursor-pointer focus:ring-0 w-28 text-[11px] font-mono"
            />
            <span className="text-[var(--text-muted)] font-mono text-[10px]">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => onToDateChange(e.target.value)}
              className="bg-transparent border-none text-[var(--text-primary)] outline-none cursor-pointer focus:ring-0 w-28 text-[11px] font-mono"
            />
          </div>

          <button
            onClick={() => {
              onFromDateChange('');
              onToDateChange('');
            }}
            className="cursor-pointer text-[10px] font-sans font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-strong)] rounded-[var(--radius-md)] px-2 py-1.5 transition-colors"
          >
            Clear dates
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 flex flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
          <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Loading runs...</span>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-16 flex flex-col items-center justify-center text-center w-full">
          <div className="h-12 w-12 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-default)] flex items-center justify-center mb-4">
            <Play className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
          </div>
          <h3 className="font-sans text-[var(--text-md)] font-semibold text-[var(--text-primary)] mb-1">
            No Execution Runs Found
          </h3>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] max-w-sm">
            Try adjusting your search criteria, clearing the dates, or resetting the status filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)]">
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider pl-4">Run ID / Workflow</th>
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-center">Status</th>
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Triggered By</th>
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Triggered At</th>
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Duration</th>
                  <th className="p-2.5 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => navigate(`/runs/${run.id}`)}
                    className="hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer group h-11"
                  >
                    <td className="p-2 pl-5 relative">
                      {/* Colored status left indicator strip */}
                      <div
                        className="absolute left-0 top-1 bottom-1 w-1 rounded-r transition-colors duration-200"
                        style={{ backgroundColor: getStatusColor(run.status) }}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {run.id.substring(0, 8)}
                        </span>
                        <span className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
                          {run.workflowName}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <StepStatusBadge status={run.status} />
                    </td>
                    <td className="p-2">
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                        <User className="h-3 w-3" />
                        {run.triggeredBy}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-0.5 font-sans text-xs text-[var(--text-secondary)]">
                        <span className="font-medium">{getRelativeTime(run.createdAt)}</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{new Date(run.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td className="p-2 font-mono text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        {getDuration(run.startedAt, run.completedAt)}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center">
                        <span className="h-7 w-7 rounded-full bg-[var(--bg-surface-raised)] border border-[var(--border-default)] group-hover:bg-[var(--accent-primary-subtle)] group-hover:border-[var(--accent-primary-border)] flex items-center justify-center transition-all">
                          <ArrowRight className="h-3.5 w-3.5 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)] transition-colors" />
                        </span>
                      </div>
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
};

