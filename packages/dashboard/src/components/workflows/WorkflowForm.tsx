import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { AlertCircle, Activity, Save } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { createWorkflow } from '../../api/workflows.ts';
import type { StepInput } from '../../api/workflows.ts';
import { ApiError } from '../../api/client.ts';
import StepBuilder from './StepBuilder.tsx';

export default function WorkflowForm() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<StepInput[]>([
    {
      stepKey: 'step-a',
      handlerName: 'http-request',
      inputConfig: {},
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
      timeoutSeconds: 300,
      dependsOn: [],
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

    // Check duplicate step keys client-side
    const keys = steps.map((s) => s.stepKey.trim());
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index && key !== '');
    if (duplicates.length > 0) {
      setTopLevelError(`Duplicate step keys detected: ${duplicates.join(', ')}. All keys must be unique.`);
      return;
    }

    setSubmitting(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session expired.');
      }

      await createWorkflow(
        {
          name,
          description: description || undefined,
          steps,
        },
        token,
      );

      navigate('/workflows');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.details) {
          // Map Zod / DAG cycle validation details directly to fields
          const mappedErrors: Record<string, string> = {};
          err.details.forEach((detail) => {
            mappedErrors[detail.field] = detail.message;
          });
          setFieldErrors(mappedErrors);
          setTopLevelError(err.message || 'DAG validation failed. Check highlighted fields.');
        } else if (err.status === 403) {
          setTopLevelError('403 Forbidden: Your user account lacks the required "operator" role. Please assign the role in your Clerk dashboard.');
        } else {
          setTopLevelError(err.message);
        }
      } else {
        setTopLevelError(err.message || 'An unexpected error occurred during submission.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-[fadeIn_0.2s_ease-out]">
      
      {/* Top level Error Alert */}
      {topLevelError && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs flex gap-2 items-start font-sans shadow-xl">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Compilation Error</span>
            <span>{topLevelError}</span>
          </div>
        </div>
      )}

      {/* 1. Context Details Panel */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 flex flex-col gap-4 shadow-lg select-none">
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
            className={`p-2 font-sans text-xs bg-[var(--bg-base)] border rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-primary)] transition-all ${
              fieldErrors.name ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'
            }`}
          />
          {fieldErrors.name && (
            <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1 mt-0.5">
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
            className="p-2.5 font-sans text-xs bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] rounded-[var(--radius-md)] outline-none h-20 resize-none"
          />
        </div>
      </div>

      {/* 2. Step DAG Configuration */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-lg">
        <StepBuilder
          steps={steps}
          onChange={setSteps}
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
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)] text-xs font-semibold px-6 shadow-md flex items-center gap-1.5 active:scale-95"
        >
          <Save className="h-4 w-4 shrink-0" />
          {submitting ? 'Compiling DAG...' : 'Save & Deploy'}
        </Button>
      </div>

    </form>
  );
}
