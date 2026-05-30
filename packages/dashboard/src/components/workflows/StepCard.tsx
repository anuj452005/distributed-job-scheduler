import { useState } from 'react';
import { Trash2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { StepInput } from '../../api/workflows.ts';
import DependencySelector from './DependencySelector.tsx';

interface StepCardProps {
  index: number;
  step: StepInput;
  allStepKeys: string[];
  onChange: (field: keyof StepInput, value: any) => void;
  onRemove: () => void;
  errors?: Record<string, string>; // Maps field name to error message, e.g., 'dependsOn' => 'Creates a cycle with step-a'
}

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

  const handlers = [
    'http-request',
    'send-email',
    'sql-query',
    'blob-to-postgres',
    'transform-json',
    'repo-indexer',
    'embedding-generator',
  ];

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
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--border-strong)] rounded-[var(--radius-lg)] p-5 flex flex-col gap-4 relative transition-all duration-200 shadow-lg group">
      
      {/* Top Header Row */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 select-none">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-[var(--accent-primary-subtle)] border border-[var(--accent-primary-border)] flex items-center justify-center font-mono text-[10px] font-bold text-[var(--accent-primary)]">
            {index + 1}
          </span>
          <span className="font-sans text-xs font-bold text-[var(--text-primary)]">
            Step Configuration
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-[var(--danger-text)] border border-transparent hover:border-[var(--danger-border)] hover:bg-[var(--danger-bg)] p-1 rounded-md transition-all duration-150"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step Key Input */}
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] text-[var(--text-secondary)] font-medium">
            Step Key <span className="text-[var(--danger-text)]">*</span>
          </label>
          <input
            type="text"
            value={step.stepKey}
            onChange={(e) => onChange('stepKey', e.target.value)}
            placeholder="e.g., query_customer_db"
            className={`p-2 font-mono text-xs text-[var(--text-mono)] bg-[var(--bg-base)] border rounded-[var(--radius-md)] outline-none focus:border-[var(--accent-primary)] transition-all ${
              errors.stepKey ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'
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
            onChange={(e) => onChange('handlerName', e.target.value)}
            className="p-2 font-sans text-xs bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--accent-primary)] rounded-[var(--radius-md)] outline-none text-[var(--text-primary)]"
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
      <div className="grid grid-cols-3 gap-3 border-t border-[var(--border-subtle)] pt-3.5">
        {/* Max Attempts */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Max Attempts</label>
          <input
            type="number"
            min={1}
            max={20}
            value={step.retryPolicy.maxAttempts}
            onChange={(e) =>
              onChange('retryPolicy', {
                ...step.retryPolicy,
                maxAttempts: parseInt(e.target.value) || 1,
              })
            }
            className="p-2 font-mono text-xs text-[var(--text-primary)] bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none text-center"
          />
        </div>

        {/* Base Delay */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Delay (ms)</label>
          <input
            type="number"
            min={100}
            step={500}
            value={step.retryPolicy.baseDelayMs}
            onChange={(e) =>
              onChange('retryPolicy', {
                ...step.retryPolicy,
                baseDelayMs: parseInt(e.target.value) || 1000,
              })
            }
            className="p-2 font-mono text-xs text-[var(--text-primary)] bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none text-center"
          />
        </div>

        {/* Timeout Seconds */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] text-[var(--text-secondary)] font-medium">Timeout (s)</label>
          <input
            type="number"
            min={5}
            step={30}
            value={step.timeoutSeconds}
            onChange={(e) => onChange('timeoutSeconds', parseInt(e.target.value) || 300)}
            className="p-2 font-mono text-xs text-[var(--text-primary)] bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[var(--radius-md)] outline-none text-center"
          />
        </div>
      </div>

      {/* Predecessors / Depends On */}
      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3.5">
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
      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3.5">
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
            <span className="font-sans text-[10px] text-[var(--state-succeeded-text)] font-semibold uppercase tracking-wider text-[9px] bg-[var(--state-succeeded-bg)] border border-[var(--state-succeeded-border)] px-1 py-0.5 rounded">
              Valid Payload
            </span>
          )}
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          onBlur={handleJsonBlur}
          placeholder='{&#10;  "url": "https://api.example.com",&#10;  "method": "POST"&#10;}'
          className={`w-full h-24 p-2.5 font-mono text-xs text-[var(--text-mono)] bg-[var(--bg-base)] border rounded-[var(--radius-md)] outline-none resize-y transition-all ${
            jsonError ? 'border-[var(--danger-border)] focus:border-[var(--danger-border)]' : 'border-[var(--border-default)] focus:border-[var(--accent-primary)]'
          }`}
        />
      </div>

    </div>
  );
}
