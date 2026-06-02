import React from 'react';

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  description: string;
  className?: string;
};

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon,
  color,
  description,
  className = '',
}) => {
  return (
    <div
      className={`flex min-h-[116px] items-start justify-between rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 select-none ${className}`}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="font-mono text-3xl font-semibold leading-none text-[var(--text-primary)]">
          {value}
        </span>
        <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
          {description}
        </span>
      </div>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border bg-[var(--bg-surface-raised)]"
        style={{
          borderColor: 'var(--border-default)',
          color,
        }}
      >
        <span className="flex h-5 w-5 items-center justify-center" style={{ color }}>
          {icon}
        </span>
      </div>
    </div>
  );
};
