import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { GitBranch, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { getWorkflows, deleteWorkflow, triggerWorkflowRun } from '../../api/workflows.ts';
import type { WorkflowDto } from '../../api/workflows.ts';
import WorkflowTable from '../../components/workflows/WorkflowTable.tsx';

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      const data = await getWorkflows(token);
      setWorkflows(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch registered workflows.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async (id: string, name: string) => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      
      const newRun = await triggerWorkflowRun(id, { inputPayload: {} }, token);
      showToast(`Dispatched run for ${name}: ${newRun.id.substring(0, 8)}`);
      
      setTimeout(() => navigate(`/runs/${newRun.id}`), 1000);
    } catch (err: any) {
      setError(`Failed to trigger workflow "${name}": ${err.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setError(null);
    if (!confirm(`Are you absolutely sure you want to delete workflow "${name}"?`)) {
      return;
    }
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      
      await deleteWorkflow(id, token);
      showToast(`Workflow "${name}" successfully deleted.`);
      loadWorkflows();
    } catch (err: any) {
      if (err.status === 409) {
        alert(`Deletion Failed: Cannot delete workflow "${name}" while it has active RUNNING executions. Please cancel active runs first.`);
      } else {
        alert(`Deletion Failed: ${err.message}`);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 relative select-none">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-[var(--state-succeeded-bg)] border border-[var(--state-succeeded-border)] p-3 text-[var(--state-succeeded-text)] shadow-2xl animate-[slideIn_0.2s_ease-out]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-sans text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] tracking-wide flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={2} />
            Workflows
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Build and manage resilient DAG pipelines with robust transactional task dependency graphs.
          </p>
        </div>
        <Button
          asChild
          className="bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)] flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-[var(--radius-md)] transition-all shadow-[0_0_15px_rgba(79,126,255,0.25)] active:scale-95"
        >
          <Link to="/workflows/new">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New Workflow
          </Link>
        </Button>
      </div>

      {/* Error Alert Box */}
      {error && !loading && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs flex gap-2 items-start max-w-2xl shadow-xl">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Connection Failure</span>
            <span>{error}</span>
            <Button onClick={loadWorkflows} variant="outline" size="xs" className="mt-3 w-fit border-[var(--danger-border)] hover:bg-[var(--bg-surface-hover)]">
              Reconnect Feed
            </Button>
          </div>
        </div>
      )}

      {/* Main Table view */}
      <WorkflowTable
        workflows={workflows}
        loading={loading}
        onTrigger={handleTrigger}
        onDelete={handleDelete}
      />

    </div>
  );
}
