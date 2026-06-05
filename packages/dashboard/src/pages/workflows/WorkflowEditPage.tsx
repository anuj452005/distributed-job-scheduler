import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { GitBranch, Eye, AlertCircle, Loader2 } from 'lucide-react';
import WorkflowForm from '../../components/workflows/WorkflowForm.tsx';
import { WorkflowDesignCanvas } from '../../components/workflows/WorkflowDesignCanvas.tsx';
import { getWorkflow } from '../../api/workflows.ts';
import type { StepInput, WorkflowDto } from '../../api/workflows.ts';
import { ReactFlowProvider } from '@xyflow/react';

export default function WorkflowEditPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<(WorkflowDto & { steps: StepInput[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewSteps, setPreviewSteps] = useState<StepInput[]>([]);

  useEffect(() => {
    if (id) {
      loadWorkflow(id);
    }
  }, [id]);

  const loadWorkflow = async (wfId: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      const data = await getWorkflow(wfId, token);
      setWorkflow(data);
      setPreviewSteps(data.steps);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow for editing.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-[var(--text-secondary)]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" />
          <p className="font-sans text-sm animate-pulse tracking-wide">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-md items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-sm text-[var(--danger-text)]">
          <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <span className="font-bold uppercase tracking-widest text-xs">Error Loading Workflow</span>
            <span className="text-[var(--danger-text)]/90">{error || 'Workflow not found.'}</span>
            <button
              onClick={() => navigate('/workflows')}
              className="mt-3 bg-[var(--danger-text)] text-[var(--bg-base)] px-4 py-1.5 rounded-[var(--radius-sm)] font-bold uppercase tracking-wider text-[10px] w-fit hover:opacity-90 active:scale-95 transition-all"
            >
              Return to Workflows
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out] select-none w-full pb-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] tracking-wide flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={2} />
            Edit Workflow: <span className="text-[var(--text-secondary)]">{workflow.name}</span>
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Modify the executable task dependency DAG graph configuration.
          </p>
        </div>
      </div>

      {/* Split Pane: Form (left) + Live DAG Preview (right) */}
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* LEFT — Workflow Form (flows naturally) */}
        <div className="flex-1 min-w-0 xl:max-w-[660px] w-full">
          <WorkflowForm
            onStepsChange={setPreviewSteps}
            initialSteps={workflow.steps}
            workflowId={workflow.id}
            initialName={workflow.name}
            initialDescription={workflow.description}
            isEditMode={true}
          />
        </div>

        {/* RIGHT — Sticky Live DAG Preview */}
        <div className="w-full xl:w-[480px] shrink-0 flex flex-col gap-2 xl:sticky xl:top-4">
          <div className="flex items-center gap-1.5 shrink-0">
            <Eye className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span className="font-sans text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Live DAG Preview
            </span>
            <span className="ml-auto font-mono text-[9px] text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
              {previewSteps.length} node{previewSteps.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-[320px] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] xl:h-[500px]">
            <ReactFlowProvider>
              <WorkflowDesignCanvas steps={previewSteps} />
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
