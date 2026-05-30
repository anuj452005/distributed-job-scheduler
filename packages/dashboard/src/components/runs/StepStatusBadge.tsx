import React from 'react';

interface StepStatusBadgeProps {
  status: string;
}

export const StepStatusBadge: React.FC<StepStatusBadgeProps> = ({ status }) => {
  const getStyle = (s: string) => {
    switch (s.toUpperCase()) {
      case 'PENDING':
        return 'bg-[var(--state-pending-bg)] text-[var(--state-pending-text)] border-[var(--state-pending-border)]';
      case 'QUEUED':
        return 'bg-[var(--state-queued-bg)] text-[var(--state-queued-text)] border-[var(--state-queued-border)]';
      case 'RUNNING':
        return 'bg-[var(--state-running-bg)] text-[var(--state-running-text)] border-[var(--state-running-border)]';
      case 'SUCCEEDED':
      case 'COMPLETED':
        return 'bg-[var(--state-succeeded-bg)] text-[var(--state-succeeded-text)] border-[var(--state-succeeded-border)]';
      case 'FAILED':
        return 'bg-[var(--state-failed-bg)] text-[var(--state-failed-text)] border-[var(--state-failed-border)]';
      case 'RETRYING':
        return 'bg-[var(--state-retrying-bg)] text-[var(--state-retrying-text)] border-[var(--state-retrying-border)]';
      case 'DEAD_LETTERED':
      case 'DLQ':
        return 'bg-[var(--state-dlq-bg)] text-[var(--state-dlq-text)] border-[var(--state-dlq-border)]';
      case 'CANCELLED':
        return 'bg-[var(--state-cancelled-bg)] text-[var(--state-cancelled-text)] border-[var(--state-cancelled-border)]';
      case 'CANCEL_REQUESTED':
        return 'bg-[var(--state-cancel-req-bg)] text-[var(--state-cancel-req-text)] border-[var(--state-cancel-req-border)]';
      default:
        return 'bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider ${getStyle(
        status
      )}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0"></span>
      {status}
    </span>
  );
};
