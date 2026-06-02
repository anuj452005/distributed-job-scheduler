import { useState } from 'react';
import { GitBranch, Eye } from 'lucide-react';
import WorkflowForm from '../../components/workflows/WorkflowForm.tsx';
import { WorkflowDesignCanvas } from '../../components/workflows/WorkflowDesignCanvas.tsx';
import type { StepInput } from '../../api/workflows.ts';
import { ReactFlowProvider } from '@xyflow/react';
import { createDeterministicDemoSteps } from '../../components/workflows/workflow-presets.ts';

export default function WorkflowCreatePage() {
  // Lift step state up so the canvas can read it
  const [previewSteps, setPreviewSteps] = useState<StepInput[]>(() => createDeterministicDemoSteps());

  return (
    <div className="flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out] select-none w-full h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-bold text-[var(--text-primary)] tracking-wide flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={2} />
            New Workflow
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Build and compile an executable task dependency DAG graph configuration.
          </p>
        </div>
      </div>

      {/* Split Pane: Form (left) + Live DAG Preview (right) */}
      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
        {/* LEFT — Workflow Form (scrollable) */}
        <div className="flex-1 min-w-0 overflow-y-auto xl:max-w-[600px]">
          <WorkflowForm onStepsChange={setPreviewSteps} initialSteps={previewSteps} />
        </div>

        {/* RIGHT — Live DAG Preview */}
        <div className="xl:w-[420px] shrink-0 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <Eye className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span className="font-sans text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Live DAG Preview
            </span>
            <span className="ml-auto font-mono text-[9px] text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
              {previewSteps.length} node{previewSteps.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-lg)] h-[320px] xl:h-full overflow-hidden shadow-inner">
            <ReactFlowProvider>
              <WorkflowDesignCanvas steps={previewSteps} />
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
