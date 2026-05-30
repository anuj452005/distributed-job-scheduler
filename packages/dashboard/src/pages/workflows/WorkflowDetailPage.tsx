import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { ChevronLeft, Calendar, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { getWorkflow } from '../../api/workflows.ts';
import type { WorkflowDto, StepInput } from '../../api/workflows.ts';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const [workflow, setWorkflow] = useState<(WorkflowDto & { steps: StepInput[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadWorkflow(id);
  }, [id]);

  const loadWorkflow = async (wfId: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      const data = await getWorkflow(wfId, token);
      setWorkflow(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve workflow configurations.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out] max-w-4xl mx-auto w-full">
      {/* Back button */}
      <div>
        <Button asChild variant="ghost" size="sm" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] -ml-2">
          <Link to="/workflows" className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 flex flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
          <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Syncing details...</span>
        </div>
      ) : error || !workflow ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-[var(--danger-text)] flex gap-3 items-start shadow-xl">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <h4 className="font-sans text-sm font-semibold">Failed to Retrieve Details</h4>
            <p className="font-sans text-xs text-[var(--text-secondary)]">{error || 'Workflow not found.'}</p>
          </div>
        </div>
      ) : (
        /* Loaded View */
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] pb-4">
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)]">
                {workflow.name}
              </h1>
              <span className="rounded bg-[var(--bg-surface-active)] border border-[var(--border-strong)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-primary)]">
                v{workflow.version}
              </span>
            </div>
            <p className="font-sans text-xs text-[var(--text-secondary)]">
              {workflow.description || 'No description provided.'}
            </p>
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] font-mono mt-1">
              <span>ID: {workflow.id}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Registered: {new Date(workflow.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Steps Timeline / List */}
          <div className="flex flex-col gap-4">
            <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              DAG Pipeline Topology ({workflow.steps.length} Steps)
            </h3>
            
            <div className="flex flex-col gap-3">
              {workflow.steps.map((step, idx) => (
                <div key={step.stepKey} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-4 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] flex items-center justify-center font-mono text-[10px] font-bold text-[var(--accent-primary)] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                        {step.stepKey}
                      </span>
                      <span className="font-sans text-[11px] text-[var(--text-secondary)]">
                        Handler: <span className="font-mono text-[10px] text-[var(--text-primary)] bg-[var(--bg-surface-active)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">{step.handlerName}</span>
                      </span>
                      {step.dependsOn.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="font-sans text-[10px] text-[var(--text-muted)]">Depends On:</span>
                          {step.dependsOn.map(dep => (
                            <span key={dep} className="font-mono text-[9px] font-semibold text-[var(--accent-primary)] bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] px-1.5 py-0.5 rounded">
                              {dep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Policies summary on right */}
                  <div className="flex flex-row sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1.5 border-t sm:border-t-0 border-[var(--border-subtle)] pt-2.5 sm:pt-0 shrink-0 font-mono text-[10px] text-[var(--text-secondary)]">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                      Timeout: {step.timeoutSeconds}s
                    </div>
                    <div>
                      Retries: {step.retryPolicy.maxAttempts}x (delay: {step.retryPolicy.baseDelayMs}ms)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
