import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import type { StepInput } from '../../api/workflows.ts';
import StepCard from './StepCard.tsx';
import { createTransformStep } from './workflow-presets.ts';

interface StepBuilderProps {
  steps: StepInput[];
  onChange: (steps: StepInput[]) => void;
  errors?: Record<string, string>; // Keys look like "steps[1].dependsOn"
}

export default function StepBuilder({
  steps,
  onChange,
  errors = {},
}: StepBuilderProps) {
  const allStepKeys = steps.map((s) => s.stepKey);

  const handleAddStep = () => {
    onChange([...steps, createTransformStep(allStepKeys)]);
  };

  const handleRemoveStep = (index: number) => {
    const stepKeyToRemove = steps[index].stepKey;
    // Remove step and filter it out from any other step's dependsOn list
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s) => ({
        ...s,
        dependsOn: s.dependsOn.filter((k) => k !== stepKeyToRemove),
      }));
    onChange(updated);
  };

  const handleStepChange = (index: number, field: keyof StepInput, value: any) => {
    const updated = [...steps];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  // Extract errors belonging to a specific step index
  const getStepErrors = (index: number) => {
    const stepErrors: Record<string, string> = {};
    const prefix = `steps[${index}].`;
    
    Object.entries(errors).forEach(([key, msg]) => {
      if (key.startsWith(prefix)) {
        const fieldName = key.substring(prefix.length);
        stepErrors[fieldName] = msg;
      }
    });
    return stepErrors;
  };

  return (
    <div className="flex flex-col gap-5">
      
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 select-none">
        <h3 className="font-sans text-[var(--text-md)] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Settings className="h-4.5 w-4.5 text-[var(--accent-primary)]" />
          DAG Step Orchestrations
        </h3>
        <Button
          type="button"
          onClick={handleAddStep}
          variant="outline"
          size="xs"
          className="flex items-center gap-1 border-[var(--accent-primary-border)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary-subtle)]"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Add Step
        </Button>
      </div>

      {/* Cards list */}
      <div className="flex flex-col gap-4">
        {steps.map((step, idx) => (
          <StepCard
            key={idx}
            index={idx}
            step={step}
            allStepKeys={allStepKeys}
            onChange={(field, val) => handleStepChange(idx, field, val)}
            onRemove={() => handleRemoveStep(idx)}
            errors={getStepErrors(idx)}
          />
        ))}

        {steps.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] border-dashed p-10 flex flex-col items-center justify-center text-center">
            <span className="font-sans text-xs text-[var(--text-secondary)] italic">
              Click the "Add Step" button above to insert your first task node in the DAG graph.
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
