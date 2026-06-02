import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { Play, CheckCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';

export type StepNodeData = {
  stepKey: string;
  handlerName: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  startedAt: string | null;
  completedAt: string | null;
};

export const StepNode = memo(({ data, selected }: NodeProps<Node<StepNodeData>>) => {
  const status = data.status.toUpperCase();

  const getStyle = (s: string) => {
    switch (s) {
      case 'PENDING':
        return {
          bg: 'var(--state-pending-bg)',
          border: 'var(--state-pending-border)',
          text: 'var(--state-pending-text)',
        };
      case 'QUEUED':
        return {
          bg: 'var(--state-queued-bg)',
          border: 'var(--state-queued-border)',
          text: 'var(--state-queued-text)',
        };
      case 'RUNNING':
        return {
          bg: 'var(--state-running-bg)',
          border: 'var(--state-running-border)',
          text: 'var(--state-running-text)',
        };
      case 'SUCCEEDED':
      case 'COMPLETED':
        return {
          bg: 'var(--state-succeeded-bg)',
          border: 'var(--state-succeeded-border)',
          text: 'var(--state-succeeded-text)',
        };
      case 'FAILED':
        return {
          bg: 'var(--state-failed-bg)',
          border: 'var(--state-failed-border)',
          text: 'var(--state-failed-text)',
        };
      case 'RETRYING':
        return {
          bg: 'var(--state-retrying-bg)',
          border: 'var(--state-retrying-border)',
          text: 'var(--state-retrying-text)',
        };
      case 'DEAD_LETTERED':
        return {
          bg: 'var(--state-dlq-bg)',
          border: 'var(--state-dlq-border)',
          text: 'var(--state-dlq-text)',
        };
      case 'CANCELLED':
        return {
          bg: 'var(--state-cancelled-bg)',
          border: 'var(--state-cancelled-border)',
          text: 'var(--state-cancelled-text)',
        };
      case 'CANCEL_REQUESTED':
        return {
          bg: 'var(--state-cancel-req-bg)',
          border: 'var(--state-cancel-req-border)',
          text: 'var(--state-cancel-req-text)',
        };
      default:
        return {
          bg: 'var(--bg-surface-raised)',
          border: 'var(--border-default)',
          text: 'var(--text-secondary)',
        };
    }
  };

  const getIcon = (s: string) => {
    const iconClass = "h-3.5 w-3.5 shrink-0";
    switch (s) {
      case 'RUNNING':
        return <Play className={`${iconClass} animate-pulse`} />;
      case 'SUCCEEDED':
      case 'COMPLETED':
        return <CheckCircle className={iconClass} />;
      case 'FAILED':
      case 'DEAD_LETTERED':
        return <AlertTriangle className={iconClass} />;
      case 'RETRYING':
        return <RefreshCw className={`${iconClass} animate-spin`} />;
      case 'QUEUED':
      default:
        return <Clock className={iconClass} />;
    }
  };

  const colors = getStyle(status);
  const isRunning = status === 'RUNNING';

  return (
    <div
      className={`relative flex min-h-[64px] min-w-[210px] flex-col justify-between rounded-[var(--radius-lg)] border p-3 pl-4.5 pr-3.5 select-none transition-colors ${
        isRunning ? 'running-node-pulse' : ''
      }`}
      style={{
        backgroundColor: colors.bg,
        borderColor: selected ? 'var(--accent-primary)' : colors.border,
        color: colors.text,
        boxShadow: selected ? '0 0 0 2px var(--accent-primary)' : undefined,
      }}
    >
      {/* Left state accent indicator strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[var(--radius-lg)]"
        style={{ backgroundColor: colors.text }}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg-base)]"
        style={{
          backgroundColor: colors.text,
        }}
      />

      <div className="flex items-center justify-between gap-2.5">
        <span className="font-mono text-xs font-bold truncate max-w-[145px] text-[var(--text-primary)]" title={data.stepKey}>
          {data.stepKey}
        </span>
        <span className="flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-surface-raised)] p-1 text-current">
          {getIcon(status)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2.5 border-t border-[var(--border-subtle)] pt-1.5">
        <span className="font-sans text-[10px] text-[var(--text-secondary)] font-medium truncate max-w-[120px]" title={data.handlerName}>
          {data.handlerName}
        </span>
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--text-muted)]">
          Try: {data.attemptCount}/{data.maxAttempts}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg-base)]"
        style={{
          backgroundColor: colors.text,
        }}
      />
    </div>
  );
});

StepNode.displayName = 'StepNode';
