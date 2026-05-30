import React from 'react';

interface RunStatusFilterProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

export const RunStatusFilter: React.FC<RunStatusFilterProps> = ({
  selectedStatus,
  onStatusChange,
}) => {
  const options = ['ALL', 'RUNNING', 'FAILED', 'COMPLETED', 'CANCELLED'];

  const getBadgeStyle = (status: string, active: boolean) => {
    if (!active) {
      return 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] border-transparent';
    }
    switch (status) {
      case 'ALL':
        return 'bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] border-[var(--accent-primary-border)]';
      case 'RUNNING':
        return 'bg-[var(--state-running-bg)] text-[var(--state-running-text)] border-[var(--state-running-border)]';
      case 'FAILED':
        return 'bg-[var(--state-failed-bg)] text-[var(--state-failed-text)] border-[var(--state-failed-border)]';
      case 'COMPLETED':
        return 'bg-[var(--state-succeeded-bg)] text-[var(--state-succeeded-text)] border-[var(--state-succeeded-border)]';
      case 'CANCELLED':
        return 'bg-[var(--state-cancelled-bg)] text-[var(--state-cancelled-text)] border-[var(--state-cancelled-border)]';
      default:
        return 'bg-[var(--bg-surface-active)] text-[var(--text-primary)] border-[var(--border-default)]';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 select-none">
      {options.map((opt) => {
        const active = selectedStatus === opt;
        return (
          <button
            key={opt}
            onClick={() => onStatusChange(opt)}
            className={`cursor-pointer rounded-full border px-3 py-1 font-sans text-[10px] font-semibold uppercase tracking-wider transition-all ${getBadgeStyle(
              opt,
              active
            )}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
};
