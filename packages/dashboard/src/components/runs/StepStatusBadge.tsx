import React from 'react';
import { 
  Clock, 
  ListOrdered, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ShieldAlert, 
  XCircle,
  AlertTriangle
} from 'lucide-react';

interface StepStatusBadgeProps {
  status: string;
}

export const StepStatusBadge: React.FC<StepStatusBadgeProps> = ({ status }) => {
  const statusUpper = status.toUpperCase();

  const getStyle = (s: string) => {
    switch (s) {
      case 'PENDING':
        return 'bg-[var(--state-pending-bg)] text-[var(--state-pending-text)] border-[var(--state-pending-border)]';
      case 'QUEUED':
        return 'bg-[var(--state-queued-bg)] text-[var(--state-queued-text)] border-[var(--state-queued-border)]';
      case 'RUNNING':
      case 'CLAIMED':
        return 'bg-[var(--state-running-bg)] text-[var(--state-running-text)] border-[var(--state-running-border)]';
      case 'SUCCEEDED':
      case 'COMPLETED':
        return 'bg-[var(--state-succeeded-bg)] text-[var(--state-succeeded-text)] border-[var(--state-succeeded-border)]';
      case 'FAILED':
        return 'bg-[var(--state-failed-bg)] text-[var(--state-failed-text)] border-[var(--state-failed-border)]';
      case 'RETRYING':
        return 'bg-[var(--state-retrying-bg)] text-[var(--state-retrying-text)] border-[var(--state-retrying-border)]';
      case 'DEAD_LETTERED':
      case 'DLQ':
        return 'bg-[var(--state-dlq-bg)] text-[var(--state-dlq-text)] border-[var(--state-dlq-border)]';
      case 'CANCELLED':
        return 'bg-[var(--state-cancelled-bg)] text-[var(--state-cancelled-text)] border-[var(--state-cancelled-border)]';
      case 'CANCEL_REQUESTED':
        return 'bg-[var(--state-cancel-req-bg)] text-[var(--state-cancel-req-text)] border-[var(--state-cancel-req-border)]';
      default:
        return 'bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]';
    }
  };

  const getIcon = (s: string) => {
    const iconClass = "h-3 w-3 shrink-0";
    switch (s) {
      case 'PENDING':
        return <Clock className={iconClass} />;
      case 'QUEUED':
        return <ListOrdered className={iconClass} />;
      case 'RUNNING':
      case 'CLAIMED':
        return <Play className={`${iconClass} text-[var(--state-running-text)] fill-[var(--state-running-text)] animate-pulse`} />;
      case 'SUCCEEDED':
      case 'COMPLETED':
        return <CheckCircle2 className={`${iconClass} text-[var(--state-succeeded-text)]`} />;
      case 'FAILED':
        return <AlertCircle className={`${iconClass} text-[var(--state-failed-text)]`} />;
      case 'RETRYING':
        return <RefreshCw className={`${iconClass} text-[var(--state-retrying-text)] animate-spin`} />;
      case 'DEAD_LETTERED':
      case 'DLQ':
        return <ShieldAlert className={`${iconClass} text-[var(--state-dlq-text)]`} />;
      case 'CANCELLED':
        return <XCircle className={iconClass} />;
      case 'CANCEL_REQUESTED':
        return <AlertTriangle className={`${iconClass} animate-pulse text-[var(--state-cancel-req-text)]`} />;
      default:
        return <Clock className={iconClass} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${getStyle(
        statusUpper
      )}`}
    >
      {getIcon(statusUpper)}
      {statusUpper === 'DEAD_LETTERED' ? 'DLQ' : statusUpper === 'CLAIMED' ? 'RUNNING' : statusUpper}
    </span>
  );
};
