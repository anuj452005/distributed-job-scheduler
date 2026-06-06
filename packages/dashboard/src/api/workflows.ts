import { apiClient } from './client.ts';

export interface StepInput {
  stepKey: string;
  handlerName: string;
  inputConfig: Record<string, unknown>;
  retryPolicy: { maxAttempts: number; baseDelayMs: number };
  timeoutSeconds: number;
  dependsOn: string[];
}

export interface CreateWorkflowBody {
  name: string;
  description?: string;
  steps: StepInput[];
}

export interface WorkflowDto {
  id: string;
  name: string;
  description?: string;
  version: number;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TriggerRunBody {
  inputPayload?: Record<string, unknown>;
}

export interface WorkflowStepRunDto {
  id: string;
  stepId: string;
  stepKey: string;
  handlerName: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  status: string;
  inputPayload: Record<string, unknown>;
  originalRunId: string | null;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  steps: WorkflowStepRunDto[];
}

export async function getWorkflows(
  token: string,
  page: number = 1,
  limit: number = 50,
): Promise<PaginatedList<WorkflowDto>> {
  return apiClient<PaginatedList<WorkflowDto>>(
    'GET',
    `/api/workflows?page=${page}&limit=${limit}`,
    undefined,
    token,
  );
}

export async function getWorkflow(id: string, token: string): Promise<WorkflowDto & { steps: StepInput[] }> {
  return apiClient<WorkflowDto & { steps: StepInput[] }>(
    'GET',
    `/api/workflows/${id}`,
    undefined,
    token,
  );
}

export async function createWorkflow(body: CreateWorkflowBody, token: string): Promise<WorkflowDto> {
  return apiClient<WorkflowDto>('POST', '/api/workflows', body, token);
}

export async function deleteWorkflow(id: string, token: string): Promise<void> {
  await apiClient<void>('DELETE', `/api/workflows/${id}`, undefined, token);
}

export async function updateWorkflow(id: string, body: CreateWorkflowBody, token: string): Promise<WorkflowDto> {
  return apiClient<WorkflowDto>('PUT', `/api/workflows/${id}`, body, token);
}

export async function triggerWorkflowRun(
  id: string,
  body: TriggerRunBody,
  token: string,
): Promise<WorkflowRunDto> {
  return apiClient<WorkflowRunDto>('POST', `/api/workflows/${id}/runs`, body, token);
}

export async function getRunsByWorkflow(
  workflowId: string,
  token: string,
  page: number = 1,
  limit: number = 20,
  status?: string,
): Promise<PaginatedList<any>> {
  let path = `/api/workflows/${workflowId}/runs?page=${page}&limit=${limit}`;
  if (status && status !== 'ALL') {
    path += `&status=${status}`;
  }
  return apiClient<PaginatedList<any>>('GET', path, undefined, token);
}
