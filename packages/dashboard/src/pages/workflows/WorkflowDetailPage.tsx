import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { ChevronLeft, Calendar, Clock, AlertCircle, Play, Pencil, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { getWorkflow, triggerWorkflowRun, getRunsByWorkflow, deleteWorkflow } from '../../api/workflows.ts';
import type { WorkflowDto, StepInput } from '../../api/workflows.ts';
import { TriggerPanel } from '../triggers/TriggerPanel.tsx';
import { RecentRunsTable } from '../../components/dashboard/RecentRunsTable.tsx';
import { useGlobalSSE } from '../../hooks/useSSE.ts';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<(WorkflowDto & { steps: StepInput[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'triggers' | 'runs' | 'settings'>('overview');

  // Runs tab states
  const [runs, setRuns] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [runsPage, setRunsPage] = useState(1);
  const [runsTotal, setRunsTotal] = useState(0);
  const runsLimit = 10;

  // Settings tab states
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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

  const loadRuns = async (showLoading = false) => {
    if (!id) return;
    if (showLoading) setRunsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getRunsByWorkflow(id, token, runsPage, runsLimit, selectedStatus);
      setRuns(data.items);
      setRunsTotal(data.total);
      setRunsError(null);
    } catch (err: any) {
      setRunsError(err.message || 'Failed to retrieve workflow execution runs');
    } finally {
      if (showLoading) setRunsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'runs') {
      loadRuns(true);
    }
  }, [id, activeTab, runsPage, selectedStatus]);

  // Real-time SSE updates for the runs list
  useGlobalSSE((event) => {
    if (activeTab !== 'runs') return;
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
    }
  }, () => {
    if (activeTab === 'runs') {
      loadRuns(false);
    }
  });

  const handleDeleteWorkflow = async () => {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth session expired.');
      await deleteWorkflow(id, token);
      navigate('/workflows');
    } catch (err: any) {
      setError(err.message || 'Failed to delete workflow');
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const runsTotalPages = Math.ceil(runsTotal / runsLimit);

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
                className="flex items-center gap-1.5 border-[var(--border-strong)] px-4 font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" />
                Edit Workflow
              </Button>
            </Link>
            <Button
              onClick={handleTrigger}
              disabled={triggering}
              size="sm"
              className="flex min-w-[130px] items-center justify-center gap-1.5 bg-[var(--accent-primary)] px-4 text-xs font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)]"
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
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-[var(--danger-text)]">
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

          {/* Premium Tab bar navigation */}
          <div className="flex border-b border-[var(--border-default)] select-none gap-6">
            {([
              { id: 'overview', label: 'Overview' },
              { id: 'triggers', label: 'Triggers' },
              { id: 'runs', label: 'Runs' },
              { id: 'settings', label: 'Settings' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[var(--accent-primary)] text-[var(--text-primary)] shadow-[0_4px_12px_rgba(79,126,255,0.08)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content Panels */}
          <div className="min-h-[300px]">
            {activeTab === 'overview' && (
              /* DAG Pipeline List */
              <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease-out]">
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
            )}

            {activeTab === 'triggers' && (
              <TriggerPanel workflowId={id!} />
            )}

            {activeTab === 'runs' && (
              <div className="flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out]">
                {runsError && (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs">
                    {runsError}
                  </div>
                )}
                
                <RecentRunsTable
                  runs={runs}
                  loading={runsLoading}
                  selectedStatus={selectedStatus}
                  onStatusChange={(status) => {
                    setSelectedStatus(status);
                    setRunsPage(1);
                  }}
                  fromDate={fromDate}
                  onFromDateChange={setFromDate}
                  toDate={toDate}
                  onToDateChange={setToDate}
                />

                {/* Runs Pagination */}
                {!runsLoading && runsTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 select-none">
                    <span className="font-sans text-[11px] text-[var(--text-secondary)]">
                      Showing <span className="font-mono font-bold text-[var(--text-primary)]">{runs.length}</span> of <span className="font-mono font-bold text-[var(--text-primary)]">{runsTotal}</span> runs
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                        disabled={runsPage === 1}
                        className="cursor-pointer p-1.5 border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] rounded-[var(--radius-md)] text-[var(--text-secondary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="font-mono text-xs text-[var(--text-primary)] px-2">
                        {runsPage} / {runsTotalPages}
                      </span>
                      <button
                        onClick={() => setRunsPage((p) => Math.min(runsTotalPages, p + 1))}
                        disabled={runsPage === runsTotalPages}
                        className="cursor-pointer p-1.5 border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] rounded-[var(--radius-md)] text-[var(--text-secondary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
                <div className="flex flex-col gap-1">
                  <h4 className="font-sans text-sm font-bold text-[var(--text-primary)]">
                    Workflow Administration
                  </h4>
                  <p className="font-sans text-xs text-[var(--text-secondary)]">
                    Manage system actions, limits, and administrative controls for this workflow pipeline.
                  </p>
                </div>

                <div className="border-t border-[var(--border-default)] pt-5">
                  <h5 className="font-sans text-xs font-bold text-[var(--danger-text)] uppercase tracking-wider mb-2">
                    Danger Zone
                  </h5>
                  <div className="rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-sans text-xs font-bold text-[var(--text-primary)]">
                        Delete Workflow Pipeline
                      </span>
                      <span className="font-sans text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        Permanently destroy this workflow pipeline, including its configuration steps, automated trigger bindings, and historical run data.
                      </span>
                    </div>

                    {deleteConfirm ? (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="font-sans text-xs font-bold text-[var(--text-primary)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 rounded-[var(--radius-md)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteWorkflow}
                          disabled={deleting}
                          className="font-sans text-xs font-bold text-[var(--text-inverse)] bg-[var(--danger-action)] hover:bg-[var(--danger-action-hover)] px-4 py-2 rounded-[var(--radius-md)] cursor-pointer transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="font-sans text-xs font-bold text-[var(--danger-text)] border border-[var(--danger-border)] hover:bg-[var(--danger-action)] hover:text-[var(--text-inverse)] px-4 py-2 rounded-[var(--radius-md)] shrink-0 cursor-pointer transition-all"
                      >
                        Delete Workflow
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
