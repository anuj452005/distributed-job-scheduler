import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Play, Trash2, Search, Calendar, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import type { WorkflowDto } from '../../api/workflows.ts';

interface WorkflowTableProps {
  workflows: WorkflowDto[];
  loading: boolean;
  onTrigger: (id: string, name: string) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
}

export default function WorkflowTable({
  workflows,
  loading,
  onTrigger,
  onDelete,
}: WorkflowTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const filteredWorkflows = workflows.filter((wf) =>
    wf.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleTriggerClick = async (id: string, name: string) => {
    setTriggeringId(id);
    try {
      await onTrigger(id, name);
    } catch (e) {
      // Handled upstream
    } finally {
      setTriggeringId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 select-none">
        {/* Search header skeleton */}
        <div className="h-9 w-64 rounded-[var(--radius-md)] bg-[var(--bg-surface-hover)] border border-[var(--border-default)] animate-pulse" />
        
        {/* Skeleton rows */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
          <div className="p-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)] h-10 w-full animate-pulse" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] p-3 flex items-center justify-between animate-pulse">
                <div className="flex flex-col gap-2 w-1/3">
                  <div className="h-3 w-3/4 rounded bg-[var(--border-strong)]" />
                  <div className="h-2 w-1/2 rounded bg-[var(--border-default)]" />
                </div>
                <div className="h-4 w-12 rounded bg-[var(--border-strong)]" />
                <div className="h-3 w-24 rounded bg-[var(--border-strong)]" />
                <div className="h-7 w-20 rounded bg-[var(--border-strong)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 select-none">
      
      {/* Search & Statistics bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-default)] p-3 rounded-[var(--radius-lg)]">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows by name..."
            className="w-full pl-9 pr-4 py-1.5 font-sans text-xs bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] rounded-[var(--radius-md)] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all"
          />
        </div>
        <div className="font-mono text-[10px] text-[var(--text-secondary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] px-3 py-1.5 rounded-[var(--radius-md)] flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          ACTIVE CONFIGS: <span className="font-bold text-[var(--text-primary)]">{filteredWorkflows.length}</span>
        </div>
      </div>

      {/* Main content conditional rendering */}
      {filteredWorkflows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-12 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-default)] flex items-center justify-center mb-4 shadow-inner">
            <GitBranch className="h-6 w-6 text-[var(--text-muted)]" strokeWidth={1.5} />
          </div>
          <h3 className="font-sans text-[var(--text-md)] font-medium text-[var(--text-primary)] mb-1">
            {searchQuery ? 'No Workflows Match Search' : 'No Workflows Registered'}
          </h3>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] max-w-sm">
            {searchQuery 
              ? 'Try adjusting your text filter keywords to match existing names.'
              : 'Create a new orchestration DAG to run jobs with customizable retries and timeouts.'}
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)] h-10 select-none">
                  <th className="px-4 py-2 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider">Workflow Configuration</th>
                  <th className="px-4 py-2 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-center w-24">Version</th>
                  <th className="px-4 py-2 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-center w-28">Steps</th>
                  <th className="px-4 py-2 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider w-40">Created At</th>
                  <th className="px-4 py-2 text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider text-right w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredWorkflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-[var(--bg-surface-hover)] h-[72px] transition-colors group">
                    <td className="px-4 py-2">
                      <Link to={`/workflows/${wf.id}`} className="flex flex-col gap-0.5 outline-none">
                        <span className="font-sans text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {wf.name}
                        </span>
                        <span className="font-sans text-[11px] text-[var(--text-secondary)] line-clamp-1">
                          {wf.description || 'No description provided.'}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] tracking-tighter">
                          ID: {wf.id}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-center w-24">
                      <span className="rounded bg-[var(--bg-surface-active)] border border-[var(--border-strong)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-primary)]">
                        v{wf.version}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center w-28">
                      <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                        {wf.stepCount} steps
                      </span>
                    </td>
                    <td className="px-4 py-2 w-40">
                      <div className="flex items-center gap-1.5 font-sans text-xs text-[var(--text-secondary)]">
                        <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                        {new Date(wf.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right w-44">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => handleTriggerClick(wf.id, wf.name)}
                          disabled={triggeringId !== null}
                          size="xs"
                          className="bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary)] hover:text-[var(--text-inverse)] flex items-center gap-1 font-semibold transition-all disabled:opacity-50"
                        >
                          <Play className={`h-3 w-3 shrink-0 ${triggeringId === wf.id ? 'animate-pulse' : ''}`} />
                          {triggeringId === wf.id ? 'Triggering...' : 'Trigger'}
                        </Button>
                        <Link to={`/workflows/${wf.id}/edit`} className="outline-none">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-[var(--text-secondary)] hover:bg-[var(--bg-surface-active)] hover:text-[var(--text-primary)] border border-transparent flex items-center gap-1.5 rounded-[var(--radius-md)] p-1.5 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                          </Button>
                        </Link>
                        <Button
                          onClick={() => onDelete(wf.id, wf.name)}
                          size="xs"
                          variant="ghost"
                          className="text-[var(--danger-text)] hover:bg-[var(--danger-bg)] hover:border-[var(--danger-border)] border border-transparent flex items-center gap-1.5 rounded-[var(--radius-md)] p-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        </Button>
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
}
