import { apiClient } from './client.ts';

export interface StepInput {
  stepKey: string;
  handlerName: string;
  inputConfig: Record<string, any>;
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
  inputPayload?: Record<string, any>;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  status: string;
  triggeredBy: string;
  createdAt: string;
  completedAt?: string;
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

export async function triggerWorkflowRun(
  id: string,
  body: TriggerRunBody,
  token: string,
): Promise<WorkflowRunDto> {
  return apiClient<WorkflowRunDto>('POST', `/api/workflows/${id}/runs`, body, token);
}
