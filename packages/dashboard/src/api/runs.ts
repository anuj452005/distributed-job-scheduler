import { apiClient } from './client.ts';
import type { PaginatedList } from './workflows.ts';

export interface StepRunDto {
  id: string;
  stepId: string;
  stepKey: string;
  handlerName: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  inputPayload: any;
  outputPayload?: any;
  errorMessage?: string | null;
  workerId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  dependsOn?: string[];
}

export interface WorkflowRunDetailDto {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  inputPayload: any;
  originalRunId: string | null;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  steps: StepRunDto[];
}

export interface RunSummaryDto {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  inputPayload: any;
  originalRunId: string | null;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function getRuns(
  token: string,
  page: number = 1,
  limit: number = 20,
  status?: string,
  from?: string,
  to?: string,
): Promise<PaginatedList<RunSummaryDto>> {
  let path = `/api/runs?page=${page}&limit=${limit}`;
  if (status && status !== 'ALL') {
    path += `&status=${status}`;
  }
  if (from) {
    path += `&from=${encodeURIComponent(from)}`;
  }
  if (to) {
    path += `&to=${encodeURIComponent(to)}`;
  }
  return apiClient<PaginatedList<RunSummaryDto>>('GET', path, undefined, token);
}

export async function getRunDetail(runId: string, token: string): Promise<WorkflowRunDetailDto> {
  return apiClient<WorkflowRunDetailDto>('GET', `/api/runs/${runId}`, undefined, token);
}

export async function retryStep(stepId: string, token: string): Promise<void> {
  await apiClient<void>('POST', `/api/steps/${stepId}/retry`, {}, token);
}

export async function replayRun(runId: string, fromStepKey: string, token: string): Promise<WorkflowRunDetailDto> {
  return apiClient<WorkflowRunDetailDto>('POST', `/api/runs/${runId}/replay`, { fromStepKey }, token);
}

export async function cancelRun(runId: string, token: string): Promise<void> {
  await apiClient<void>('POST', `/api/runs/${runId}/cancel`, {}, token);
}
