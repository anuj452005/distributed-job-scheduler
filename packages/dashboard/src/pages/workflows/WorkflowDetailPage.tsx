import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { ChevronLeft, Calendar, Clock, AlertCircle, Play, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { getWorkflow, triggerWorkflowRun } from '../../api/workflows.ts';
import type { WorkflowDto, StepInput } from '../../api/workflows.ts';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<(WorkflowDto & { steps: StepInput[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

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

  const handleTrigger = async () => {
    if (!workflow || !id) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      const run = await triggerWorkflowRun(id, { inputPayload: {} }, token);
      navigate(`/runs/${run.id}`);
    } catch (err: any) {
      setTriggerError(err.message || 'Failed to trigger run.');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out] max-w-4xl mx-auto w-full">
      {/* Back button + Trigger Run action */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] -ml-2">
          <Link to="/workflows" className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Button>

        {workflow && (
          <div className="flex items-center gap-3">
            <Link to={`/workflows/${id}/edit`} className="outline-none">
              <Button
                size="sm"
                variant="outline"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-strong)] flex items-center gap-1.5 font-semibold px-4 shadow-sm active:scale-95 transition-all"
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" />
                Edit Workflow
              </Button>
            </Link>
            <Button
              onClick={handleTrigger}
              disabled={triggering}
              size="sm"
              className="bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)] flex items-center gap-1.5 text-xs font-semibold px-4 shadow-md active:scale-95 min-w-[130px] justify-center"
            >
              {triggering ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-inverse)] border-t-transparent animate-spin shrink-0" />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0" />
              )}
              {triggering ? 'Triggering...' : 'Trigger Run'}
            </Button>
          </div>
        )}
      </div>

      {/* Trigger Error */}
      {triggerError && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-[var(--danger-text)] text-xs flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{triggerError}</span>
        </div>
      )}

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
          {/* Header Info */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                {workflow.name}
              </h1>
              <span className="rounded bg-[var(--bg-surface-active)] border border-[var(--border-strong)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-primary)]">
                v{workflow.version}
              </span>
            </div>
            <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
              {workflow.description || 'No description provided.'}
            </p>
            <div className="flex items-center gap-4 mt-2 font-mono text-[10px] text-[var(--text-muted)] tracking-wider">
              <span className="flex items-center gap-1.5">
                ID: {workflow.id}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 shrink-0" />
                Registered: {new Date(workflow.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* DAG Pipeline List */}
          <div className="flex flex-col gap-3">
            <h3 className="font-sans text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
              DAG Pipeline Topology ({workflow.steps.length} Steps)
            </h3>
            <div className="flex flex-col gap-2">
              {workflow.steps.map((step, index) => (
                <div key={step.stepKey} className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-hover)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-[var(--border-strong)] transition-colors">
                  
                  {/* Step Left Info */}
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] flex items-center justify-center font-mono text-[10px] font-bold text-[var(--accent-primary)] shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="font-sans text-sm font-bold text-[var(--text-primary)] font-mono">
                        {step.stepKey}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className="text-[var(--text-secondary)]">Handler:</span>
                        <span className="bg-[var(--bg-base)] border border-[var(--border-strong)] px-1.5 py-0.5 rounded text-[var(--text-primary)]">
                          {step.handlerName}
                        </span>
                      </div>
                      
                      {step.dependsOn.length > 0 && (
                        <div className="flex items-center gap-1.5 font-mono text-[10px] mt-1">
                          <span className="text-[var(--text-muted)]">Depends On:</span>
                          <div className="flex gap-1 flex-wrap">
                            {step.dependsOn.map(dep => (
                              <span key={dep} className="text-[var(--accent-primary)] bg-[var(--accent-primary-subtle)] px-1.5 py-0.5 rounded border border-[var(--accent-primary-border)]/30">
                                {dep}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step Right Info (Retry/Timeout) */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 sm:gap-2 font-mono text-[10px] text-[var(--text-secondary)]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                      Timeout: {step.timeoutSeconds}s
                    </div>
                    <div className="flex items-center gap-1.5">
                      Retries: {step.retryPolicy.maxAttempts}x <span className="text-[var(--text-muted)]">(delay: {step.retryPolicy.baseDelayMs}ms)</span>
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
