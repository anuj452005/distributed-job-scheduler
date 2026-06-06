import React from 'react';

const STATUS_COLORS = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_8px_rgba(34,197,94,0.05)]',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_8px_rgba(234,179,8,0.05)]',
  DISABLED: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
} as const;

interface TriggerStatusBadgeProps {
  status: keyof typeof STATUS_COLORS;
}

export const TriggerStatusBadge: React.FC<TriggerStatusBadgeProps> = ({ status }) => {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-sans select-none ${
        STATUS_COLORS[status] || STATUS_COLORS.DISABLED
      }`}
    >
      {status}
    </span>
  );
};
export default TriggerStatusBadge;
