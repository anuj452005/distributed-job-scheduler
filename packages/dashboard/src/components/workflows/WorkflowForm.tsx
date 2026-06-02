import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { AlertCircle, Activity, Save } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { createWorkflow, updateWorkflow, triggerWorkflowRun } from '../../api/workflows.ts';
import type { StepInput } from '../../api/workflows.ts';
import { ApiError } from '../../api/client.ts';
import StepBuilder from './StepBuilder.tsx';
import { createDeterministicDemoSteps } from './workflow-presets.ts';

interface WorkflowFormProps {
  // When provided, the parent can read step state for a live DAG preview
  onStepsChange?: (steps: StepInput[]) => void;
  initialSteps?: StepInput[];
  workflowId?: string;
  initialName?: string;
  initialDescription?: string;
  isEditMode?: boolean;
}

export default function WorkflowForm({
  onStepsChange,
  initialSteps,
  workflowId,
  initialName = '',
  initialDescription = '',
  isEditMode = false,
}: WorkflowFormProps) {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [steps, setSteps] = useState<StepInput[]>(initialSteps ?? createDeterministicDemoSteps());

  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState(isEditMode ? 'Save Changes' : 'Save & Deploy');
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleStepsChange = (updated: StepInput[]) => {
    setSteps(updated);
    onStepsChange?.(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopLevelError(null);
    setFieldErrors({});

    // Client-side validations
    if (!name.trim()) {
      setFieldErrors({ name: 'Workflow name is required.' });
      return;
    }

    if (steps.length === 0) {
      setTopLevelError('Please configure at least one step in the DAG.');
      return;
    }

    // Check for empty step keys
    const emptyKey = steps.find((s) => !s.stepKey.trim());
    if (emptyKey) {
      setTopLevelError('All steps must have a non-empty step key.');
      return;
    }

    // Check duplicate step keys client-side
    const keys = steps.map((s) => s.stepKey.trim());
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index && key !== '');
    if (duplicates.length > 0) {
      setTopLevelError(`Duplicate step keys detected: ${duplicates.join(', ')}. All keys must be unique.`);
      return;
    }

    setSubmitting(true);
    setStatusText('Saving...');

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session expired. Please refresh the page.');
      }

      let workflow;
      if (isEditMode && workflowId) {
        workflow = await updateWorkflow(
          workflowId,
          {
            name,
            description: description || undefined,
            steps,
          },
          token,
        );
        setStatusText('Saved!');
        // Return to detail view after edit
        navigate(`/workflows/${workflow.id}`);
        return;
      } else {
        workflow = await createWorkflow(
          {
            name,
            description: description || undefined,
            steps,
          },
          token,
        );
        
        setStatusText('Triggering first run...');
        
        try {
          const run = await triggerWorkflowRun(workflow.id, { inputPayload: {} }, token);
          navigate(`/runs/${run.id}`);
        } catch (triggerErr: any) {
          if (triggerErr instanceof ApiError) {
            if (triggerErr.status === 403) {
              setTopLevelError('Workflow saved successfully, but you lack permissions to trigger runs. You can view it in the Workflows list.');
            } else {
              setTopLevelError(`Workflow saved successfully, but failed to dispatch run: ${triggerErr.message}.`);
            }
          } else {
            setTopLevelError(`Workflow saved, but could not start run: ${triggerErr.message || 'Unknown error'}.`);
          }
          
          // Still navigate to workflows so the user can see their saved workflow
          setTimeout(() => navigate('/workflows'), 3000);
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.details) {
          const mappedErrors: Record<string, string> = {};
          err.details.forEach((detail) => {
            mappedErrors[detail.field] = detail.message;
          });
          setFieldErrors(mappedErrors);
          setTopLevelError(err.message || 'DAG validation failed. Check highlighted fields.');
        } else if (err.status === 403) {
          setTopLevelError('Access denied. Make sure you are signed in and try again.');
        } else if (err.status === 401) {
          setTopLevelError('Session expired. Please sign in again.');
        } else {
          setTopLevelError(err.message || 'Server error. Please try again.');
        }
      } else {
        setTopLevelError(err.message || 'An unexpected error occurred during submission.');
      }
      setStatusText(isEditMode ? 'Save Changes' : 'Save & Deploy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-[fadeIn_0.2s_ease-out]">
      
      {/* Top level Error Alert */}
      {topLevelError && (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 font-sans text-xs text-[var(--danger-text)]">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Error</span>
            <span>{topLevelError}</span>
          </div>
        </div>
      )}

      {/* 1. Context Details Panel */}
      <div className="relative flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 select-none">
        <h4 className="font-sans text-[var(--text-xs)] text-[var(--text-primary)] font-bold uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2 flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-[var(--accent-primary)] animate-pulse" />
          1. Pipeline Context
        </h4>

        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Workflow Name <span className="text-[var(--danger-text)]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Process Customer Invoice Transactions"
            className={`rounded-[var(--radius-md)] border bg-[var(--bg-base)] p-2.5 font-sans text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] ${
              fieldErrors.name ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'
            }`}
          />
          {fieldErrors.name && (
            <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1 mt-0.5 animate-pulse">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {fieldErrors.name}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Specify trigger events, expected input payloads, and operation guidelines..."
            className="h-20 resize-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-3 font-sans text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
          />
        </div>
      </div>

      {/* 2. Step DAG Configuration */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 select-none">
        <StepBuilder
          steps={steps}
          onChange={handleStepsChange}
          errors={fieldErrors}
        />
      </div>

      {/* 3. Action Footer Buttons */}
      <div className="flex items-center justify-end gap-3 select-none border-t border-[var(--border-subtle)] pt-4">
        <Button
          type="button"
          onClick={() => navigate('/workflows')}
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="flex min-w-[160px] items-center justify-center gap-1.5 bg-[var(--accent-primary)] px-6 text-xs font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)]"
        >
          {submitting ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-inverse)] border-t-transparent animate-spin shrink-0" />
          ) : (
            <Save className="h-4 w-4 shrink-0" />
          )}
          {statusText}
        </Button>
      </div>

    </form>
  );
}
