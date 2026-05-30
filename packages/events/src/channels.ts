export const CHANNEL_GLOBAL = 'flowforge:events:global';

export function runChannel(workflowRunId: string): string {
  return `flowforge:events:run:${workflowRunId}`;
}

export function workerHeartbeatKey(workerId: string): string {
  return `flowforge:worker:${workerId}:heartbeat`;
}
