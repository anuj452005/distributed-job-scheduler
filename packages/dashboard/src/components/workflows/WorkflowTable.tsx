import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, GitBranch, Pencil, Play, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import type { WorkflowDto } from '../../api/workflows.ts';

type WorkflowTableProps = {
  workflows: WorkflowDto[];
  loading: boolean;
  onTrigger: (id: string, name: string) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
};

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
    } finally {
      setTriggeringId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 select-none">
        <div className="h-9 w-64 animate-pulse rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-hover)]" />
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="h-10 w-full animate-pulse border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)] p-3" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex h-[64px] animate-pulse items-center justify-between p-3">
                <div className="flex w-1/3 flex-col gap-2">
                  <div className="h-3 w-3/4 rounded-[var(--radius-sm)] bg-[var(--border-strong)]" />
                  <div className="h-2 w-1/2 rounded-[var(--radius-sm)] bg-[var(--border-default)]" />
                </div>
                <div className="h-4 w-12 rounded-[var(--radius-sm)] bg-[var(--border-strong)]" />
                <div className="h-3 w-24 rounded-[var(--radius-sm)] bg-[var(--border-strong)]" />
                <div className="h-7 w-20 rounded-[var(--radius-sm)] bg-[var(--border-strong)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 select-none">
      <div className="flex flex-col items-stretch justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows by name..."
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] py-1.5 pl-9 pr-4 font-sans text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)] transition-colors focus:border-[var(--accent-primary)]"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] px-3 py-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
          <GitBranch className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          ACTIVE CONFIGS: <span className="font-bold text-[var(--text-primary)]">{filteredWorkflows.length}</span>
        </div>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-surface-hover)]">
            <GitBranch className="h-6 w-6 text-[var(--text-muted)]" strokeWidth={1.5} />
          </div>
          <h3 className="mb-1 font-sans text-[var(--text-md)] font-medium text-[var(--text-primary)]">
            {searchQuery ? 'No workflows match search' : 'No workflows registered'}
          </h3>
          <p className="max-w-sm font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
            {searchQuery
              ? 'Adjust the workflow name filter.'
              : 'Create a workflow DAG to start dispatching distributed job runs.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-10 border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)]">
                  <th className="px-4 py-2.5 pl-5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Workflow Configuration</th>
                  <th className="w-24 px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Version</th>
                  <th className="w-28 px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Steps</th>
                  <th className="w-40 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Created At</th>
                  <th className="w-44 px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredWorkflows.map((wf) => (
                  <tr key={wf.id} className="h-16 transition-colors hover:bg-[var(--bg-surface-hover)]">
                    <td className="relative px-4 py-2 pl-5">
                      <div className="absolute bottom-1 left-0 top-1 w-1 rounded-r-[var(--radius-sm)] bg-[var(--accent-primary)]" />
                      <Link to={`/workflows/${wf.id}`} className="flex flex-col gap-0.5 pl-1 outline-none">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="h-4 w-4 text-[var(--text-secondary)]" />
                          <span className="font-sans text-xs font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--accent-primary)]">
                            {wf.name}
                          </span>
                        </div>
                        <span className="line-clamp-1 max-w-[420px] font-sans text-[11px] text-[var(--text-secondary)]">
                          {wf.description || 'No description provided.'}
                        </span>
                      </Link>
                    </td>
                    <td className="w-24 px-4 py-2 text-center">
                      <span className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-primary)]">
                        v{wf.version}
                      </span>
                    </td>
                    <td className="w-28 px-4 py-2 text-center font-mono text-xs text-[var(--text-primary)]">
                      {wf.stepCount} steps
                    </td>
                    <td className="w-40 px-4 py-2">
                      <div className="flex items-center gap-1.5 font-sans text-xs text-[var(--text-secondary)]">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                        {new Date(wf.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="w-44 px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2 pr-1">
                        <Button
                          onClick={() => handleTriggerClick(wf.id, wf.name)}
                          disabled={triggeringId !== null}
                          size="xs"
                          className="flex items-center gap-1 border border-[var(--accent-primary-border)] bg-[var(--accent-primary-subtle)] font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)] hover:text-[var(--text-inverse)] disabled:opacity-50"
                        >
                          <Play className={`h-3 w-3 shrink-0 ${triggeringId === wf.id ? 'animate-pulse' : ''}`} />
                          {triggeringId === wf.id ? 'Triggering...' : 'Trigger'}
                        </Button>
                        <Link to={`/workflows/${wf.id}/edit`} className="outline-none">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="rounded-[var(--radius-md)] border border-transparent p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-active)] hover:text-[var(--text-primary)]"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                          </Button>
                        </Link>
                        <Button
                          onClick={() => onDelete(wf.id, wf.name)}
                          size="xs"
                          variant="ghost"
                          className="rounded-[var(--radius-md)] border border-transparent p-1.5 text-[var(--danger-text)] hover:border-[var(--danger-border)] hover:bg-[var(--danger-bg)]"
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
