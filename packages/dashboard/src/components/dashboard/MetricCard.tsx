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
  const getSparklinePath = (l: string) => {
    switch (l.toLowerCase()) {
      case 'queue depth':
        return {
          line: 'M 0 30 Q 15 10 30 25 T 60 15 T 80 30 T 100 20',
          stroke: 'M 0 30 Q 15 10 30 25 T 60 15 T 80 30 T 100 20 L 100 40 L 0 40 Z',
        };
      case 'active workers':
        return {
          line: 'M 0 20 Q 20 15 40 25 T 80 18 T 100 22',
          stroke: 'M 0 20 Q 20 15 40 25 T 80 18 T 100 22 L 100 40 L 0 40 Z',
        };
      case 'jobs last hour':
        return {
          line: 'M 0 35 Q 25 30 50 20 T 75 10 T 100 5',
          stroke: 'M 0 35 Q 25 30 50 20 T 75 10 T 100 5 L 100 40 L 0 40 Z',
        };
      case 'failure rate':
      default:
        return {
          line: 'M 0 38 Q 30 38 50 35 T 80 15 T 100 38',
          stroke: 'M 0 38 Q 30 38 50 35 T 80 15 T 100 38 L 100 40 L 0 40 Z',
        };
    }
  };

  const sparkline = getSparklinePath(label);
  const gradId = `grad-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div
      className={`glass-panel glow-card rounded-xl p-5 flex items-center justify-between select-none group relative overflow-hidden ${className}`}
      style={{
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Background Sparkline Wave */}
      <div className="absolute bottom-0 left-0 right-0 h-11 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-300">
        <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={sparkline.stroke}
            fill={`url(#${gradId})`}
          />
          <path
            d={sparkline.line}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-1.5 relative z-10">
        <span className="font-sans text-[10px] font-bold tracking-wider text-[var(--text-secondary)] uppercase bg-white/[0.01] border border-white/[0.03] px-2 py-0.5 rounded w-fit">
          {label}
        </span>
        <span className="font-mono text-3xl font-extrabold text-[var(--text-primary)] tracking-tight transition-all group-hover:scale-[1.03] duration-300 origin-left mt-1">
          {value}
        </span>
        <span className="font-sans text-[10px] text-[var(--text-muted)] font-medium mt-1">
          {description}
        </span>
      </div>
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 shadow-sm relative z-10"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 10%, rgba(255, 255, 255, 0.01))`,
          borderColor: `color-mix(in srgb, ${color} 25%, rgba(255, 255, 255, 0.05))`,
          color: color,
          boxShadow: `0 4px 12px color-mix(in srgb, ${color} 8%, transparent)`,
        }}
      >
        <span className="h-5 w-5 flex items-center justify-center" style={{ color: color }}>
          {icon}
        </span>
      </div>
    </div>
  );
};
