
import { GitBranch } from 'lucide-react';
import WorkflowForm from '../../components/workflows/WorkflowForm.tsx';

export default function WorkflowCreatePage() {
  return (
    <div className="flex flex-col gap-6 animate-[fadeIn_0.2s_ease-out] select-none max-w-4xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
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

      {/* Renders Workflow Form */}
      <WorkflowForm />

    </div>
  );
}
