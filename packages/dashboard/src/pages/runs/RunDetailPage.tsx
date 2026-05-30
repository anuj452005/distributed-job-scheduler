import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { ChevronLeft, AlertCircle, List } from 'lucide-react';
import { DagCanvas } from '../../components/runs/DagCanvas.tsx';
import { RunStatusBar } from '../../components/runs/RunStatusBar.tsx';
import { StepDetailDrawer } from '../../components/runs/StepDetailDrawer.tsx';
import { StepStatusBadge } from '../../components/runs/StepStatusBadge.tsx';
import { getRunDetail, retryStep, replayRun, cancelRun } from '../../api/runs.ts';
import { useSSE } from '../../hooks/useSSE.ts';
import type { WorkflowRunDetailDto } from '../../api/runs.ts';

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [run, setRun] = useState<WorkflowRunDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Step for Drawer view
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined);

  // 1. Fetch full run state
  const loadRunDetail = async (showLoading = false) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      const data = await getRunDetail(id, token);
      setRun(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve active job queues.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // 2. Trigger initial fetch
  useEffect(() => {
    loadRunDetail(true);
    setSelectedStepId(undefined);
  }, [id]);

  // 3. Subscribe to real-time events for this run
  useSSE(id, (event) => {
    setRun((prev) => {
      if (!prev) return null;

      // Determine updated run-level status if it's a workflow event
      const updatedRunStatus = event.type.startsWith('workflow.') ? event.status : prev.status;

      // Map over step runs to merge live state updates
      const updatedSteps = prev.steps.map((step) => {
        const isMatch =
          step.id === event.stepRunId ||
          (event.stepId && step.stepId === event.stepId);

        if (isMatch) {
          return {
            ...step,
            status: event.status,
            attemptCount: event.attempt !== undefined ? event.attempt : step.attemptCount,
            errorMessage: event.errorMessage !== undefined ? event.errorMessage : step.errorMessage,
          };
        }
        return step;
      });

      return {
        ...prev,
        status: updatedRunStatus,
        steps: updatedSteps,
      };
    });
  }, () => {
    // Re-sync full state on SSE gateway reconnect
    loadRunDetail(false);
  });

  // 4. API Event Operations
  const handleCancelRun = async () => {
    if (!id) return;
    const token = await getToken();
    if (!token) return;
    await cancelRun(id, token);
    await loadRunDetail(false);
  };

  const handleReplayAll = async () => {
    if (!run || !run.steps || run.steps.length === 0) return;
    const firstStep = run.steps[0].stepKey;
    const token = await getToken();
    if (!token) return;
    const newRun = await replayRun(run.id, firstStep, token);
    navigate(`/runs/${newRun.id}`);
  };

  const handleReplayFromStep = async (stepKey: string) => {
    if (!id) return;
    const token = await getToken();
    if (!token) return;
    const newRun = await replayRun(id, stepKey, token);
    navigate(`/runs/${newRun.id}`);
  };

  const handleRetryStep = async (stepRunId: string) => {
    const token = await getToken();
    if (!token) return;
    await retryStep(stepRunId, token);
    await loadRunDetail(false);
  };

  // Find step information for selected step drawer
  const selectedStep = run?.steps.find((s) => s.id === selectedStepId);

  return (
    <div className="flex flex-col gap-4 select-none h-full animate-[fadeIn_0.2s_ease-out]">
      {/* Navigation & Header */}
      <div>
        <button
          onClick={() => navigate('/runs')}
          className="cursor-pointer flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-sans text-xs font-semibold -ml-2 p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to runs list
        </button>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 flex flex-col items-center justify-center flex-1">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
          <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Syncing details...</span>
        </div>
      ) : error || !run ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 text-[var(--danger-text)] flex gap-3 items-start shadow-xl max-w-2xl">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <h4 className="font-sans text-sm font-semibold">Failed to Retrieve Details</h4>
            <p className="font-sans text-xs text-[var(--text-secondary)]">{error || 'Execution run not found.'}</p>
          </div>
        </div>
      ) : (
        /* Three Column Dashboard Workspace */
        <div className="flex flex-col gap-4 flex-1 h-[calc(100vh-160px)]">
          {/* Top Status Bar component */}
          <RunStatusBar
            run={run}
            onCancel={handleCancelRun}
            onReplayAll={handleReplayAll}
            isReadOnly={false}
          />

          {/* Core Content: Left side list, Center DAG Canvas, Right Drawer */}
          <div className="flex flex-1 gap-4 overflow-hidden relative">
            {/* Column 1: Step list (240px wide, hidden on mobile or small devices) */}
            <div className="hidden lg:flex w-[240px] flex-col gap-3 shrink-0 border-r border-[var(--border-default)] pr-4 overflow-y-auto">
              <span className="font-sans text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5 select-none">
                <List className="h-3.5 w-3.5" />
                Pipeline Steps
              </span>

              <div className="flex flex-col gap-2">
                {run.steps.map((step) => {
                  const isSelected = step.id === selectedStepId;
                  return (
                    <button
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`cursor-pointer w-full text-left p-3 rounded-[var(--radius-md)] border font-sans text-xs flex flex-col gap-1.5 transition-all duration-150 ${
                        isSelected
                          ? 'bg-[var(--accent-primary-subtle)] border-[var(--accent-primary-border)] shadow-md'
                          : 'bg-[var(--bg-surface)] border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="font-mono text-xs font-bold truncate max-w-[120px]" title={step.stepKey}>
                          {step.stepKey}
                        </span>
                        <StepStatusBadge status={step.status} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                        <span className="truncate max-w-[110px]" title={step.handlerName}>{step.handlerName}</span>
                        <span className="text-[var(--text-muted)] font-semibold shrink-0">Try: {step.attemptCount}x</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Center DAG Canvas (Flexible width, takes all remaining space) */}
            <div className="flex-1 h-full min-w-0">
              <DagCanvas
                steps={run.steps}
                onStepClick={(step) => setSelectedStepId(step.id)}
                selectedStepId={selectedStepId}
              />
            </div>

            {/* Column 3: Collapsible Drawer on right (Opens on node/step list selection) */}
            {selectedStep && (
              <StepDetailDrawer
                step={selectedStep}
                onClose={() => setSelectedStepId(undefined)}
                onRetry={handleRetryStep}
                onReplay={handleReplayFromStep}
                isReadOnly={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
