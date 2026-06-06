import React from 'react';
import type { TriggerDto } from '../../api/triggers.ts';
import { TriggerRow } from './TriggerRow.tsx';
import { Calendar } from 'lucide-react';

interface TriggerListProps {
  triggers: TriggerDto[];
  onSelect: (id: string) => void;
  onStateChanged: () => void;
  token: string;
  isReadOnly: boolean;
}

export const TriggerList: React.FC<TriggerListProps> = ({
  triggers,
  onSelect,
  onStateChanged,
  token,
  isReadOnly,
}) => {
  if (triggers.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-12 text-center text-[var(--text-secondary)] select-none flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-default)] flex items-center justify-center mb-4">
          <Calendar className="h-5 w-5 text-[var(--text-muted)]" strokeWidth={1.5} />
        </div>
        <h3 className="font-sans text-[var(--text-md)] font-semibold text-[var(--text-primary)] mb-1">
          No Automation Triggers
        </h3>
        <p className="font-sans text-[var(--text-xs)] max-w-xs leading-normal">
          This workflow does not have any active triggers. Click "New Trigger" to automate pipeline execution.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {triggers.map((t) => (
        <TriggerRow
          key={t.id}
          trigger={t}
          onSelect={onSelect}
          onStateChanged={onStateChanged}
          token={token}
          isReadOnly={isReadOnly}
        />
      ))}
    </div>
  );
};
export default TriggerList;
