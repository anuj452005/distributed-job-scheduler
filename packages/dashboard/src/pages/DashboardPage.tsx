
import { LayoutDashboard, ShieldAlert, Cpu, Activity, Clock } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 select-none">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-sans text-[var(--text-xl)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
            Dashboard
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)] mt-1">
            Real-time telemetry and overview of the orchestration system.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-[var(--state-succeeded-bg)] border border-[var(--state-succeeded-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--state-succeeded-text)]">
          <span className="h-2 w-2 rounded-full bg-[var(--state-succeeded-text)] animate-ping"></span>
          System Operational
        </div>
      </div>

      {/* Grid structure for metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Queue Depth */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">Queue Depth</span>
            <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">0</span>
          </div>
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--state-queued-bg)] border border-[var(--state-queued-border)] flex items-center justify-center">
            <Clock className="h-5 w-5 text-[var(--state-queued-text)]" strokeWidth={1.5} />
          </div>
        </div>

        {/* Card 2: Active Workers */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">Active Workers</span>
            <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">0</span>
          </div>
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--state-running-bg)] border border-[var(--state-running-border)] flex items-center justify-center">
            <Cpu className="h-5 w-5 text-[var(--state-running-text)]" strokeWidth={1.5} />
          </div>
        </div>

        {/* Card 3: Execution Velocity */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">Throughput</span>
            <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">0.0 <span className="text-xs font-sans font-normal text-[var(--text-muted)]">ops/s</span></span>
          </div>
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] flex items-center justify-center">
            <Activity className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
          </div>
        </div>

        {/* Card 4: DLQ Count */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">DLQ Failures</span>
            <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">0</span>
          </div>
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--state-dlq-bg)] border border-[var(--state-dlq-border)] flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-[var(--state-dlq-text)]" strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Main sections layout */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6">
        <h2 className="font-sans text-[var(--text-lg)] font-semibold text-[var(--text-primary)] mb-2">
          Overview Telemetry
        </h2>
        <p className="font-sans text-[var(--text-sm)] text-[var(--text-secondary)]">
          Welcome to the FlowForge Administration Console. Use the left sidebar to manage workflows, review active task execution runs, and trace telemetry logging feeds.
        </p>
      </div>
    </div>
  );
}
