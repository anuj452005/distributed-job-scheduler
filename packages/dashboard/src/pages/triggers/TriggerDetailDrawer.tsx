import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clock, Calendar, Zap, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';
import cronstrue from 'cronstrue';
import {
  getTriggerDetail,
  pauseTrigger,
  resumeTrigger,
  disableTrigger,
  deleteTrigger,
  rotateTriggerToken,
} from '../../api/triggers.ts';
import type { TriggerDto, TriggerExecutionDto } from '../../api/triggers.ts';
import { TriggerStatusBadge } from './TriggerStatusBadge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Link } from 'react-router-dom';

interface TriggerDetailDrawerProps {
  triggerId: string;
  onClose: () => void;
  onStateChanged: () => void;
  token: string;
  isReadOnly: boolean;
}

export const TriggerDetailDrawer: React.FC<TriggerDetailDrawerProps> = ({
  triggerId,
  onClose,
  onStateChanged,
  token,
  isReadOnly,
}) => {
  const [trigger, setTrigger] = useState<TriggerDto | null>(null);
  const [history, setHistory] = useState<TriggerExecutionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions states
  const [transitioning, setTransitioning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTriggerDetail(triggerId, token);
      setTrigger(data.trigger);
      setHistory(data.recentExecutions);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve trigger details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [triggerId]);

  const handleAction = async (actionFn: () => Promise<any>) => {
    setTransitioning(true);
    setError(null);
    try {
      await actionFn();
      await loadDetail();
      onStateChanged();
    } catch (err: any) {
      setError(err.message || 'Transition request failed');
    } finally {
      setTransitioning(false);
    }
  };

  const handleDelete = async () => {
    setTransitioning(true);
    setError(null);
    try {
      await deleteTrigger(triggerId, token);
      onStateChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Deletion failed');
      setTransitioning(false);
    }
  };

  const handleRotate = async () => {
    setConfirmRotate(false);
    setTransitioning(true);
    setError(null);
    try {
      await rotateTriggerToken(triggerId, token);
      await loadDetail();
      onStateChanged();
    } catch (err: any) {
      setError(err.message || 'Rotation failed');
      setTransitioning(false);
    }
  };

  // Cron human description
  let cronDescription = '';
  if (trigger && trigger.type === 'cron' && trigger.config.cron) {
    try {
      cronDescription = cronstrue.toString(trigger.config.cron);
    } catch {
      cronDescription = 'Invalid cron expression';
    }
  }

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const webhookUrl = trigger && trigger.config.webhook_token ? `${apiBase}/api/webhooks/${trigger.config.webhook_token}` : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getHistoryStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'ACCEPTED':
      case 'SUCCEEDED': return 'var(--state-succeeded-text)';
      case 'FAILED': return 'var(--state-failed-text)';
      case 'DEDUPLICATED': return 'var(--state-pending-text)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div className="fixed bottom-0 right-0 top-12 z-40 flex h-[calc(100vh-48px)] w-full max-w-[400px] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface-raised)] select-none animate-[slideInRight_0.2s_ease-out]">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Trigger Details
          </span>
          {trigger && (
            <>
              <h2 className="mt-1 max-w-[260px] break-all font-sans text-sm font-bold text-[var(--text-primary)]">
                {trigger.name}
              </h2>
              <span className="mt-0.5 font-mono text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                Type: {trigger.type}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {trigger && <TriggerStatusBadge status={trigger.status} />}
          <button
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-md)] border border-transparent p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center p-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4"></div>
            <span className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider">Syncing detail...</span>
          </div>
        ) : error || !trigger ? (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)] text-xs font-sans">
            <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Failed to Load Details</span>
              <span>{error || 'Trigger config missing.'}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Meta Timestamps */}
            <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              {trigger.last_fired_at && (
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    Last Fired
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {new Date(trigger.last_fired_at).toLocaleTimeString()}
                  </span>
                </div>
              )}

              {trigger.next_fire_at && (
                <div className="flex items-center justify-between font-mono text-xs border-t border-[var(--border-subtle)] pt-3">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    Next Fired Schedule
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {new Date(trigger.next_fire_at).toLocaleTimeString()}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 font-mono text-xs">
                <span className="text-[var(--text-secondary)]">Registered At</span>
                <span className="font-medium text-[var(--text-muted)]">
                  {new Date(trigger.created_at).toLocaleDateString()} {new Date(trigger.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Config Box */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3">
              <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Automation Configuration
              </span>

              {trigger.type === 'cron' && (
                <div className="flex flex-col gap-2 font-mono text-xs bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 select-text">
                  <div className="flex justify-between border-b border-[var(--border-subtle)] pb-2">
                    <span className="text-[var(--text-secondary)]">Expression</span>
                    <span className="font-bold text-[var(--text-primary)]">{trigger.config.cron}</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-subtle)] py-2">
                    <span className="text-[var(--text-secondary)]">Misfire Policy</span>
                    <span className="text-[var(--text-primary)]">{trigger.config.misfire_policy || 'SKIP'}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-[var(--text-secondary)] block mb-1">Human Readable</span>
                    <span className="text-[var(--accent-primary)] font-sans font-medium">{cronDescription}</span>
                  </div>
                </div>
              )}

              {trigger.type === 'webhook' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 select-text">
                    <span className="font-sans text-[10px] text-[var(--text-secondary)]">Webhook URL</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2 py-1 font-mono text-[9px] text-[var(--text-primary)] select-all outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        className="rounded-[var(--radius-sm)] bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] p-1 text-[var(--text-inverse)] cursor-pointer shrink-0 transition-colors"
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between font-mono text-xs border border-[var(--border-default)] bg-[var(--bg-base)] rounded-[var(--radius-md)] p-3">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                      HMAC Signature Verification
                    </span>
                    <span className={`font-semibold ${trigger.config.secret ? 'text-[var(--state-succeeded-text)]' : 'text-[var(--text-muted)]'}`}>
                      {trigger.config.secret ? 'ACTIVE (Verified)' : 'DISABLED'}
                    </span>
                  </div>

                  {!isReadOnly && trigger.status !== 'DISABLED' && (
                    <div className="flex flex-col gap-2 mt-1">
                      {confirmRotate ? (
                        <div className="rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 flex flex-col gap-2">
                          <span className="font-sans text-[10px] font-bold text-[var(--danger-text)] uppercase tracking-wide">
                            Rotate Webhook Token?
                          </span>
                          <p className="font-sans text-[10px] text-[var(--text-primary)] leading-normal">
                            This will invalidate the existing URL immediately. External service calls using the old token will return 404.
                          </p>
                          <div className="flex gap-2 justify-end mt-1">
                            <button
                              onClick={() => setConfirmRotate(false)}
                              className="font-sans text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-default)] rounded px-2 py-1 cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleRotate}
                              className="font-sans text-[10px] font-bold text-[var(--text-inverse)] bg-[var(--danger-action)] hover:bg-[var(--danger-action-hover)] rounded px-2 py-1 cursor-pointer transition-colors"
                            >
                              Yes, Rotate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmRotate(true)}
                          className="w-full flex items-center justify-center gap-1.5 font-bold text-xs border-[var(--border-strong)]"
                          disabled={transitioning}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Rotate Webhook URL Token
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {trigger.type === 'event' && (
                <div className="flex items-center justify-between font-mono text-xs bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 select-text">
                  <span className="text-[var(--text-secondary)]">Event Topic</span>
                  <span className="font-bold text-[var(--accent-primary)] font-mono">{trigger.config.event_type}</span>
                </div>
              )}
            </div>

            {/* Execution History */}
            <div className="flex flex-col gap-3">
              <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] select-none">
                Recent Trigger Deliveries (Last 10)
              </span>

              {history.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-8 text-center text-[var(--text-secondary)] text-[11px]">
                  No executions logged for this trigger yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-hover)] font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
                        <th className="p-2 pl-4">Timestamp</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-right pr-4">Run Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {history.map((exec) => (
                        <React.Fragment key={exec.id}>
                          <tr className="h-9 hover:bg-[var(--bg-surface-hover)] transition-colors">
                            <td className="p-2 pl-4 text-[10px] font-mono text-[var(--text-secondary)]">
                              {new Date(exec.triggered_at).toLocaleTimeString()}
                            </td>
                            <td className="p-2 text-center font-bold text-[10px] tracking-wider" style={{ color: getHistoryStatusColor(exec.status) }}>
                              {exec.status}
                            </td>
                            <td className="p-2 text-right pr-4">
                              {exec.workflow_run_id ? (
                                <Link
                                  to={`/runs/${exec.workflow_run_id}`}
                                  className="text-[var(--accent-primary)] hover:underline font-mono text-[10px]"
                                >
                                  {exec.workflow_run_id.substring(0, 8)}
                                </Link>
                              ) : (
                                <span className="text-[var(--text-muted)] font-mono text-[10px]">None</span>
                              )}
                            </td>
                          </tr>
                          {exec.status === 'FAILED' && exec.error_message && (
                            <tr>
                              <td colSpan={3} className="p-2 bg-[var(--danger-bg)]/40 border-b border-[var(--border-subtle)] text-[10px] font-mono text-[var(--danger-text)] px-4 leading-normal select-text">
                                <span className="font-bold">Error:</span> {exec.error_message}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer Operator Actions */}
      {!isReadOnly && trigger && !loading && (
        <div className="flex shrink-0 gap-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-5 select-none">
          {trigger.status === 'ACTIVE' && (
            <>
              <button
                onClick={() => handleAction(() => pauseTrigger(triggerId, token))}
                disabled={transitioning}
                className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors"
              >
                Pause
              </button>
              <button
                onClick={() => handleAction(() => disableTrigger(triggerId, token))}
                disabled={transitioning}
                className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--bg-surface-active)] hover:bg-[var(--bg-surface-hover)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--danger-text)] disabled:opacity-50 transition-colors"
              >
                Disable
              </button>
            </>
          )}

          {trigger.status === 'PAUSED' && (
            <>
              <button
                onClick={() => handleAction(() => resumeTrigger(triggerId, token))}
                disabled={transitioning}
                className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-inverse)] disabled:opacity-50 transition-colors"
              >
                Resume
              </button>
              <button
                onClick={() => handleAction(() => disableTrigger(triggerId, token))}
                disabled={transitioning}
                className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--bg-surface-active)] hover:bg-[var(--bg-surface-hover)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--danger-text)] disabled:opacity-50 transition-colors"
              >
                Disable
              </button>
            </>
          )}

          {trigger.status === 'DISABLED' && (
            <div className="w-full">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={transitioning}
                    className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--danger-action)] hover:bg-[var(--danger-action-hover)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--text-inverse)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Trigger
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--danger-bg)] border-[var(--danger-border)] hover:bg-[var(--danger-action)] px-3 py-2.5 font-sans text-xs font-bold text-[var(--danger-text)] hover:text-[var(--text-inverse)] transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Trigger
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default TriggerDetailDrawer;
