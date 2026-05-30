import React from 'react';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  description: string;
  className?: string;
}

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
      className={`rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center justify-between hover:border-[var(--border-strong)] transition-all select-none group ${className}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="font-mono text-2xl font-bold text-[var(--text-primary)] transition-transform group-hover:scale-105 duration-200 origin-left">
          {value}
        </span>
        <span className="font-sans text-[10px] text-[var(--text-muted)] mt-1">
          {description}
        </span>
      </div>
      <div
        className="h-10 w-10 rounded-[var(--radius-md)] flex items-center justify-center border transition-all duration-300"
        style={{
          backgroundColor: `var(--bg-surface-raised)`,
          borderColor: `var(--border-default)`,
          color: color,
        }}
      >
        <span className="h-5 w-5 flex items-center justify-center" style={{ color: color }}>
          {icon}
        </span>
      </div>
    </div>
  );
};
