import React, { useState } from 'react';
import { Calendar, Zap, Activity, Clock, Play, Pause, Square, Trash2, Settings } from 'lucide-react';
import cronstrue from 'cronstrue';
import { pauseTrigger, resumeTrigger, disableTrigger, deleteTrigger } from '../../api/triggers.ts';
import type { TriggerDto } from '../../api/triggers.ts';
import { TriggerStatusBadge } from './TriggerStatusBadge.tsx';

interface TriggerRowProps {
  trigger: TriggerDto;
  onSelect: (id: string) => void;
  onStateChanged: () => void;
  token: string;
  isReadOnly: boolean;
}

export const TriggerRow: React.FC<TriggerRowProps> = ({
  trigger,
  onSelect,
  onStateChanged,
  token,
  isReadOnly,
}) => {
  const [transitioning, setTransitioning] = useState(false);

  const handleAction = async (e: React.MouseEvent, actionFn: () => Promise<any>) => {
    e.stopPropagation(); // prevent opening the drawer
    setTransitioning(true);
    try {
      await actionFn();
      onStateChanged();
    } catch (err) {
      console.error('Trigger action failed:', err);
    } finally {
      setTransitioning(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete trigger "${trigger.name}"?`)) {
      return;
    }
    setTransitioning(true);
    try {
      await deleteTrigger(trigger.id, token);
      onStateChanged();
    } catch (err) {
      console.error('Delete action failed:', err);
      setTransitioning(false);
    }
  };

  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Icon selector
  const renderIcon = () => {
    switch (trigger.type) {
      case 'cron':
        return <Calendar className="h-4.5 w-4.5 text-[var(--accent-primary)]" strokeWidth={1.8} />;
      case 'webhook':
        return <Zap className="h-4.5 w-4.5 text-yellow-400 animate-pulse" strokeWidth={1.8} />;
      case 'event':
        return <Activity className="h-4.5 w-4.5 text-purple-400" strokeWidth={1.8} />;
    }
  };

  // Description selector
  const renderDescription = () => {
    switch (trigger.type) {
      case 'cron':
        try {
          return cronstrue.toString(trigger.config.cron || '');
        } catch {
          return `Cron expression: ${trigger.config.cron}`;
        }
      case 'webhook':
        return 'HTTP POST Endpoint Webhook URL Receiver';
      case 'event':
        return `Listens for event: "${trigger.config.event_type}"`;
    }
  };

  return (
    <div
      onClick={() => onSelect(trigger.id)}
      className="flex items-center justify-between p-4 bg-[var(--bg-surface-hover)] border border-[var(--border-default)] rounded-[var(--radius-md)] hover:border-[var(--border-strong)] transition-all cursor-pointer group select-none"
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {/* Type Icon Container */}
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] shrink-0 group-hover:border-[var(--accent-primary-border)] transition-colors">
          {renderIcon()}
        </div>

        {/* Text Info */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-sans text-xs font-bold text-[var(--text-primary)] truncate">
              {trigger.name}
            </span>
            <TriggerStatusBadge status={trigger.status} />
          </div>
          <span className="font-sans text-[11px] text-[var(--text-secondary)] truncate">
            {renderDescription()}
          </span>
          
          <div className="flex items-center gap-4 font-mono text-[9px] text-[var(--text-muted)] mt-1 select-none">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Last fired: {getRelativeTime(trigger.last_fired_at)}
            </span>
            {trigger.status === 'ACTIVE' && trigger.type === 'cron' && trigger.next_fire_at && (
              <>
                <span>•</span>
                <span>Next: {new Date(trigger.next_fire_at).toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons & Caret */}
      <div className="flex items-center gap-3 shrink-0 select-none">
        
        {/* State action buttons for Operators */}
        {!isReadOnly && (
          <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
            {trigger.status === 'ACTIVE' && (
              <>
                <button
                  onClick={(e) => handleAction(e, () => pauseTrigger(trigger.id, token))}
                  disabled={transitioning}
                  className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] hover:bg-[var(--bg-surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Pause trigger"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleAction(e, () => disableTrigger(trigger.id, token))}
                  disabled={transitioning}
                  className="p-1.5 rounded-[var(--radius-sm)] border border-transparent hover:bg-[var(--danger-bg)] text-[var(--text-secondary)] hover:text-[var(--danger-text)] transition-colors cursor-pointer"
                  title="Disable trigger"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {trigger.status === 'PAUSED' && (
              <>
                <button
                  onClick={(e) => handleAction(e, () => resumeTrigger(trigger.id, token))}
                  disabled={transitioning}
                  className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)] transition-colors cursor-pointer"
                  title="Resume trigger"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleAction(e, () => disableTrigger(trigger.id, token))}
                  disabled={transitioning}
                  className="p-1.5 rounded-[var(--radius-sm)] border border-transparent hover:bg-[var(--danger-bg)] text-[var(--text-secondary)] hover:text-[var(--danger-text)] transition-colors cursor-pointer"
                  title="Disable trigger"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {trigger.status === 'DISABLED' && (
              <button
                onClick={handleDelete}
                disabled={transitioning}
                className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-bg)] hover:bg-[var(--danger-action)] text-[var(--danger-text)] hover:text-[var(--text-inverse)] transition-all cursor-pointer"
                title="Delete trigger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="h-7 w-7 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] flex items-center justify-center transition-colors group-hover:border-[var(--accent-primary-border)] group-hover:bg-[var(--accent-primary-subtle)]">
          <Settings className="h-3.5 w-3.5 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)] transition-colors" />
        </div>
      </div>

    </div>
  );
};
export default TriggerRow;
