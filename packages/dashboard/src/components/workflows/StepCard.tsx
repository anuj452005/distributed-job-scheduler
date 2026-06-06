import { useState } from 'react';
import { Trash2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { StepInput } from '../../api/workflows.ts';
import DependencySelector from './DependencySelector.tsx';

interface StepCardProps {
  index: number;
  step: StepInput;
  allStepKeys: string[];
  onChange: (fieldOrChanges: keyof StepInput | Partial<StepInput>, value?: any) => void;
  onRemove: () => void;
  errors?: Record<string, string>;
}

const HANDLER_TEMPLATES: Record<string, Record<string, unknown>> = {
  'transform-json': { expression: '{ "result": value }', input: { value: 'sample' } },
  'http-request': { url: 'https://example.com', method: 'GET', timeoutMs: 10000, throwOnError: true },
  'send-email': { connectionRef: 'smtp-main', to: ['user@example.com'], subject: 'Hello', body: 'Email content here.' },
  'sql-query': { connectionRef: 'primary-db', query: 'SELECT * FROM users LIMIT 10;', params: [] },
  'blob-to-postgres': {
    sourceConnectionRef: 'source-blob',
    targetConnectionRef: 'target-postgres',
    blobPath: 'imports/file.csv',
    targetTable: 'my_table',
    columnMapping: { name: 'full_name' },
    batchSize: 500,
  },
  'repo-indexer': { repoUrl: 'https://github.com/owner/repo', branch: 'main' },
  'embedding-generator': { connectionRef: 'openai-main', text: 'content to embed', model: 'text-embedding-ada-002' },
};

const HANDLER_HINTS: Record<string, string> = {
  'http-request': 'Required: url. Optional: method (GET/POST/PUT/DELETE), headers (object), body (object).',
  'send-email': 'Required: connectionRef, to array, subject, body.',
  'sql-query': 'Required: connectionRef, query. Optional: params array.',
  'blob-to-postgres': 'Required: sourceConnectionRef, targetConnectionRef, blobPath, targetTable, columnMapping.',
  'transform-json': 'Required: expression and input. This evaluates JSONata against the input object.',
  'repo-indexer': 'Required: repoUrl. Optional: branch and outputDir.',
  'embedding-generator': 'Required: connectionRef and text. Optional: model.',
};

export default function StepCard({
  index,
  step,
  allStepKeys,
  onChange,
  onRemove,
  errors = {},
}: StepCardProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(step.inputConfig, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handlers = Object.keys(HANDLER_TEMPLATES);

  const handleHandlerChange = (newHandler: string) => {
    const template = HANDLER_TEMPLATES[newHandler] ?? {};
    const templateStr = JSON.stringify(template, null, 2);
    setJsonText(templateStr);
    onChange({
      handlerName: newHandler,
      inputConfig: template,
    });
    setJsonError(null);
  };

  const handleJsonChange = (val: string) => {
    setJsonText(val);
    if (!val.trim()) {
      setJsonError(null);
      onChange('inputConfig', {});
      return;
    }
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);
      onChange('inputConfig', parsed);
    } catch (e: any) {
      setJsonError(e.message || 'Invalid JSON format');
    }
  };

  const handleJsonBlur = () => {
    if (!jsonText.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch (e) {
      // Keep raw text, error is already displayed
    }
  };

  return (
    <div className="relative flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">

      {/* Left visual state accent strip */}
      <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-[var(--radius-lg)] bg-[var(--accent-primary)]" />

      {/* Top Header Row */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 select-none relative z-10 pl-1.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent-primary-border)] bg-[var(--accent-primary-subtle)] font-mono text-[10px] font-bold text-[var(--accent-primary)]">
            {index + 1}
          </span>
          <span className="font-sans text-xs font-bold text-[var(--text-primary)]">
            Step Configuration
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--danger-text)] border border-transparent hover:border-[var(--danger-border)] hover:bg-[var(--danger-bg)] p-1.5 rounded-md transition-all duration-150"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10 pl-1.5">
        {/* Step Key Input */}
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Step Key <span className="text-[var(--danger-text)]">*</span>
          </label>
          <input
            type="text"
            value={step.stepKey}
            onChange={(e) => onChange('stepKey', e.target.value)}
            placeholder="e.g., fetch_user_data"
            className={`rounded-[var(--radius-md)] border bg-[var(--bg-base)] p-2.5 font-mono text-xs text-[var(--text-mono)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] ${errors.stepKey ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'
              }`}
          />
          {errors.stepKey && (
            <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1 mt-0.5 animate-pulse">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {errors.stepKey}
            </span>
          )}
        </div>

        {/* Task Handler Type Select */}
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Task Handler Type <span className="text-[var(--danger-text)]">*</span>
          </label>
          <select
            value={step.handlerName}
            onChange={(e) => handleHandlerChange(e.target.value)}
            className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2.5 font-sans text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
          >
            {handlers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          {errors.handlerName && (
            <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1 mt-0.5 animate-pulse">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {errors.handlerName}
            </span>
          )}
        </div>
      </div>

      {/* Execution Policies */}
      <div className="grid grid-cols-3 gap-3 border-t border-[var(--border-subtle)] pt-3.5 relative z-10 pl-1.5">
        {/* Max Attempts */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Max Attempts</label>
          <input
            type="number"
            min={1}
            max={10}
            value={step.retryPolicy.maxAttempts}
            onChange={(e) =>
              onChange('retryPolicy', {
                ...step.retryPolicy,
                maxAttempts: parseInt(e.target.value) || 1,
              })
            }
            className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-center font-mono text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
          />
        </div>

        {/* Base Delay */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Delay (ms)</label>
          <input
            type="number"
            min={100}
            step={100}
            value={step.retryPolicy.baseDelayMs}
            onChange={(e) =>
              onChange('retryPolicy', {
                ...step.retryPolicy,
                baseDelayMs: parseInt(e.target.value) || 1000,
              })
            }
            className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-center font-mono text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
          />
        </div>

        {/* Timeout Seconds */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Timeout (s)</label>
          <input
            type="number"
            min={5}
            step={1}
            value={step.timeoutSeconds}
            onChange={(e) => onChange('timeoutSeconds', parseInt(e.target.value) || 300)}
            className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-center font-mono text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]"
          />
        </div>
      </div>

      {/* Predecessors / Depends On */}
      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3.5 relative z-10 pl-1.5">
        <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1.5">
          Depends On (Predecessor Step Keys)
          <span title="Select other step keys that must complete successfully before this step will be promoted.">
            <Info className="h-3 w-3 text-[var(--text-muted)] cursor-help" />
          </span>
        </label>

        <DependencySelector
          currentStepKey={step.stepKey}
          allStepKeys={allStepKeys}
          selectedDependencies={step.dependsOn}
          onChange={(deps) => onChange('dependsOn', deps)}
        />

        {errors.dependsOn && (
          <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1.5 mt-1 border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2 rounded animate-pulse">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errors.dependsOn}
          </span>
        )}
      </div>

      {/* Input Config JSON Editor */}
      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3.5 relative z-10 pl-1.5">
        <div className="flex items-center justify-between">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Input Configuration (JSON Payload)
          </label>
          {jsonError ? (
            <span className="font-sans text-[10px] text-[var(--danger-text)] flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Malformed JSON
            </span>
          ) : (
            <span className="font-sans text-[10px] text-[var(--state-succeeded-text)] font-semibold uppercase tracking-wider text-[9px] bg-[var(--state-succeeded-bg)] border border-[var(--state-succeeded-border)] px-1.5 py-0.5 rounded">
              Valid Payload
            </span>
          )}
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          onBlur={handleJsonBlur}
          className={`h-28 w-full resize-y rounded-[var(--radius-md)] border bg-[var(--bg-base)] p-3 font-mono text-xs text-[var(--text-mono)] outline-none transition-colors ${jsonError ? 'border-[var(--danger-border)] focus:border-[var(--danger-border)]' : 'border-[var(--border-default)] hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)]'
            }`}
        />
        {/* Handler-specific hint */}
        {HANDLER_HINTS[step.handlerName] && (
          <span className="font-sans text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
            <Info className="h-3 w-3 shrink-0 text-[var(--accent-primary)]" />
            {HANDLER_HINTS[step.handlerName]}
          </span>
        )}
      </div>

    </div>
  );
}
