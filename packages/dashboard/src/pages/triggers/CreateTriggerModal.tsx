import React, { useState } from 'react';
import { X, Copy, Check, Calendar, Zap, RefreshCw, AlertCircle } from 'lucide-react';
import cronstrue from 'cronstrue';
import { createTrigger, getTriggerDetail } from '../../api/triggers.ts';
import { Button } from '@/components/ui/button.tsx';

interface CreateTriggerModalProps {
  workflowId: string;
  onClose: () => void;
  onCreated: () => void;
  token: string;
}

export const CreateTriggerModal: React.FC<CreateTriggerModalProps> = ({
  workflowId,
  onClose,
  onCreated,
  token,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'cron' | 'webhook' | 'event'>('cron');

  // Cron config
  const [cronPreset, setCronPreset] = useState('*/5 * * * *');
  const [cron, setCron] = useState('*/5 * * * *');
  const [misfirePolicy, setMisfirePolicy] = useState<'SKIP' | 'RUN_ONCE' | 'CATCH_UP'>('SKIP');

  // Webhook config
  const [secret, setSecret] = useState('');

  // Event config
  const [eventType, setEventType] = useState('');

  // Status & Validation
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success result for webhook trigger
  const [createdWebhookToken, setCreatedWebhookToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Derive cron description
  let cronDescription = '';
  let isCronValid = false;
  if (type === 'cron' && cron.trim()) {
    try {
      cronDescription = cronstrue.toString(cron.trim());
      isCronValid = true;
    } catch {
      cronDescription = 'Invalid cron expression';
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic Validation
    if (!name.trim()) {
      setError('Trigger name is required');
      return;
    }

    if (type === 'cron') {
      if (!cron.trim()) {
        setError('Cron expression is required');
        return;
      }
      if (!isCronValid) {
        setError('Please enter a valid cron expression');
        return;
      }
    } else if (type === 'event') {
      if (!eventType.trim()) {
        setError('Event type is required');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payloadConfig: Record<string, any> = {};
      if (type === 'cron') {
        payloadConfig.cron = cron.trim();
        payloadConfig.misfire_policy = misfirePolicy;
      } else if (type === 'webhook') {
        if (secret.trim()) {
          payloadConfig.secret = secret.trim();
        }
      } else if (type === 'event') {
        payloadConfig.event_type = eventType.trim();
      }

      const res = await createTrigger(
        workflowId,
        {
          type,
          name: name.trim(),
          config: payloadConfig,
        },
        token,
      );

      if (type === 'webhook') {
        // We need the generated token. Let's fetch the details to get the webhook_token
        // wait, the create endpoint returns { id: string }
        // Let's call GET /api/triggers/:id to fetch the webhook_token from config
        const detail = await getTriggerDetail(res.id, token);
        setCreatedWebhookToken(detail.trigger.config.webhook_token || null);
      } else {
        onCreated();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create trigger');
      setSubmitting(false);
    }
  };

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const webhookUrl = createdWebhookToken ? `${apiBase}/api/webhooks/${createdWebhookToken}` : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-[480px] rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] shadow-2xl animate-[slideIn_0.15s_ease-out]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <h3 className="font-sans text-sm font-bold text-[var(--text-primary)]">
            {createdWebhookToken ? 'Webhook Trigger Created' : 'Create New Trigger'}
          </h3>
          {!createdWebhookToken && (
            <button
              onClick={onClose}
              className="rounded-[var(--radius-md)] border border-transparent p-1 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-[var(--danger-text)] text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {createdWebhookToken ? (
          /* Webhook Success screen */
          <div className="p-5 flex flex-col gap-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col gap-2.5">
              <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Webhook URL (Use POST)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--text-primary)] select-all outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="rounded-[var(--radius-sm)] bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] p-1.5 text-[var(--text-inverse)] transition-colors cursor-pointer shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="font-sans text-[10px] text-[var(--text-secondary)] leading-normal">
                This token is a capability token. Anyone with this URL can trigger this workflow. Keep it secure.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-default)]">
              <Button
                onClick={onCreated}
                size="sm"
                className="bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-inverse)] font-bold text-xs"
              >
                Close and Finish
              </Button>
            </div>
          </div>
        ) : (
          /* Form screen */
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
            
            {/* Trigger Name */}
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-medium text-[var(--text-secondary)]">
                Trigger Name <span className="text-[var(--danger-text)]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Run Nightly Report Cleanups"
                className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
                disabled={submitting}
              />
            </div>

            {/* Type Selector Tabs */}
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-medium text-[var(--text-secondary)]">
                Trigger Automation Type
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-0.5">
                {(['cron', 'webhook', 'event'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-[var(--radius-sm)] py-1 text-center font-sans text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                      type === t
                        ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                    disabled={submitting}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional Config Panels */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3">
              {type === 'cron' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Schedule Preset
                    </label>
                    <select
                      value={cronPreset}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCronPreset(val);
                        if (val !== 'custom') {
                          setCron(val);
                        }
                      }}
                      className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2 py-1.5 font-sans text-xs text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent-primary)]"
                      disabled={submitting}
                    >
                      <option value="*/5 * * * *">Every 5 Minutes (*/5 * * * *)</option>
                      <option value="0 * * * *">Every Hour (0 * * * *)</option>
                      <option value="0 0 * * *">Daily at Midnight (0 0 * * *)</option>
                      <option value="0 0 * * 1">Weekly on Mondays (0 0 * * 1)</option>
                      <option value="custom">Custom Cron Expression...</option>
                    </select>
                  </div>

                  {cronPreset === 'custom' && (
                    <div className="flex flex-col gap-1.5 animate-[fadeIn_0.15s_ease-out]">
                      <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Custom Cron Expression
                      </label>
                      <input
                        type="text"
                        value={cron}
                        onChange={(e) => setCron(e.target.value)}
                        placeholder="e.g., */5 * * * * or 0 9 * * 1-5"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                        disabled={submitting}
                      />
                    </div>
                  )}

                  {cron.trim() && (
                    <div className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-sm)] p-2.5 font-sans text-[11px] leading-relaxed">
                      <span className="text-[var(--text-secondary)] block font-bold uppercase text-[9px] tracking-wider mb-1">
                        Schedule Description
                      </span>
                      <span className={isCronValid ? 'text-[var(--accent-primary)] font-medium' : 'text-[var(--danger-text)]'}>
                        {cronDescription}
                      </span>
                    </div>
                  )}


                  <div className="flex flex-col gap-1.5">
                    <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Misfire Policy
                    </label>
                    <select
                      value={misfirePolicy}
                      onChange={(e) => setMisfirePolicy(e.target.value as any)}
                      className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2 py-1.5 font-sans text-xs text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent-primary)]"
                      disabled={submitting}
                    >
                      <option value="SKIP">Skip missed occurrences (Default)</option>
                      <option value="RUN_ONCE">Fire immediately once upon recovery</option>
                      <option value="CATCH_UP">Fire all missed ticks consecutively</option>
                    </select>
                  </div>
                </>
              )}

              {type === 'webhook' && (
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    HMAC Verification Secret (Optional)
                  </label>
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter HMAC signing secret (leaves verification disabled if empty)"
                    className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2.5 py-1.5 font-sans text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    disabled={submitting}
                  />
                  <span className="font-sans text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    If set, the receiver verifies the `X-Flowforge-Signature` header matching the hex HMAC-SHA256 signature of the raw body payload.
                  </span>
                </div>
              )}

              {type === 'event' && (
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Event Topic / Channel
                  </label>
                  <input
                    type="text"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    placeholder="e.g., order.created or user.login"
                    className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-base)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    disabled={submitting}
                  />
                  <span className="font-sans text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    Fires automatically when the Redis events channel registers matching events.
                  </span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-default)] pt-4 select-none">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                size="sm"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-inverse)] font-bold text-xs"
              >
                {submitting && (
                  <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                )}
                {submitting ? 'Creating...' : 'Create Trigger'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
export default CreateTriggerModal;
