/**
 * Options required to fire a trigger and create a new workflow run.
 * All fields are required except idempotencyKey (NULL for cron runs).
 */
export interface TriggerOptions {
  triggerId: string;
  workflowId: string;
  payload: Record<string, unknown>;
  /**
   * External delivery ID (webhook/event only).
   * Pass undefined or omit for cron-sourced triggers — the
   * DB will store NULL, which bypasses the unique constraint.
   */
  idempotencyKey?: string;
  sourceType: 'cron' | 'webhook' | 'event';
  userId: string;
}

export type TriggerResult =
  | { status: 'SUCCEEDED'; runId: string }
  | { status: 'FAILED'; error: string }
  | { status: 'DEDUPLICATED' };
