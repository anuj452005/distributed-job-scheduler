import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { CalendarRange, Plus } from 'lucide-react';
import { getTriggers } from '../../api/triggers.ts';
import type { TriggerDto } from '../../api/triggers.ts';
import { TriggerList } from './TriggerList.tsx';
import { CreateTriggerModal } from './CreateTriggerModal.tsx';
import { TriggerDetailDrawer } from './TriggerDetailDrawer.tsx';
import { useGlobalSSE } from '../../hooks/useSSE.ts';

interface TriggerPanelProps {
  workflowId: string;
}

export const TriggerPanel: React.FC<TriggerPanelProps> = ({ workflowId }) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [triggers, setTriggers] = useState<TriggerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');

  // Modals & Drawer state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);

  // Determine user role
  const role = (user?.publicMetadata?.role as string) || 'operator';
  const isReadOnly = role === 'viewer';

  const loadTriggers = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      setAuthToken(token);
      const data = await getTriggers(workflowId, token);
      setTriggers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve workflow triggers');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadTriggers(true);

    const interval = setInterval(() => {
      loadTriggers(false);
    }, 30_000);

    return () => clearInterval(interval);
  }, [workflowId]);

  // Subscribe to real-time events to refresh triggers lists instantly
  useGlobalSSE(
    (event) => {
      // Refresh list on runs triggers or workflow states completing
      if (
        event.type === 'run.trigger' ||
        event.type === 'workflow.completed' ||
        event.type === 'workflow.failed' ||
        event.type === 'workflow.cancelled'
      ) {
        loadTriggers(false);
      }
    },
    () => {
      loadTriggers(false);
    }
  );

  const handleCreated = () => {
    setShowCreate(false);
    loadTriggers(false);
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-[fadeIn_0.2s_ease-out]">
      
      {/* Header Area */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-sans text-[var(--text-lg)] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-[var(--accent-primary)]" strokeWidth={1.5} />
            Automation Triggers
          </h1>
          <p className="font-sans text-[var(--text-xs)] text-[var(--text-secondary)]">
            Configure automated event-driven triggers, schedules, and custom webhooks for this workflow.
          </p>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="cursor-pointer flex items-center gap-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-inverse)] font-bold transition-all shadow-[0_0_12px_rgba(79,126,255,0.2)]"
          >
            <Plus className="h-4 w-4" />
            New Trigger
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 flex flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
          <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Syncing triggers...</span>
        </div>
      ) : (
        <TriggerList
          triggers={triggers}
          onSelect={setSelectedTriggerId}
          onStateChanged={() => loadTriggers(false)}
          token={authToken}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateTriggerModal
          workflowId={workflowId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          token={authToken}
        />
      )}

      {/* Details Drawer */}
      {selectedTriggerId && (
        <TriggerDetailDrawer
          triggerId={selectedTriggerId}
          onClose={() => setSelectedTriggerId(null)}
          onStateChanged={() => loadTriggers(false)}
          token={authToken}
          isReadOnly={isReadOnly}
        />
      )}

    </div>
  );
};
export default TriggerPanel;
