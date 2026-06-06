import { apiClient } from './client.ts';

export interface TriggerConfig {
  cron?: string;
  misfire_policy?: 'SKIP' | 'RUN_ONCE' | 'CATCH_UP';
  webhook_token?: string;
  secret?: string | null;
  event_type?: string;
}

export interface TriggerDto {
  id: string;
  workflow_id: string;
  name: string;
  type: 'cron' | 'webhook' | 'event';
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  config: TriggerConfig;
  next_fire_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface TriggerExecutionDto {
  id: string;
  status: 'SUCCEEDED' | 'FAILED' | 'DEDUPLICATED' | 'ACCEPTED';
  triggered_at: string;
  source_type: string;
  idempotency_key: string | null;
  error_message: string | null;
  workflow_run_id: string | null;
}

export interface TriggerDetailResponse {
  trigger: TriggerDto;
  recentExecutions: TriggerExecutionDto[];
}

export interface CreateTriggerPayload {
  type: 'cron' | 'webhook' | 'event';
  name: string;
  config: {
    cron?: string;
    misfire_policy?: 'SKIP' | 'RUN_ONCE' | 'CATCH_UP';
    secret?: string;
    event_type?: string;
  };
}

export interface UpdateTriggerPayload {
  name?: string;
  config?: Record<string, unknown>;
}

export async function getTriggers(workflowId: string, token: string): Promise<TriggerDto[]> {
  const res = await apiClient<{ triggers: TriggerDto[] }>(
    'GET',
    `/api/workflows/${workflowId}/triggers`,
    undefined,
    token,
  );
  return res.triggers;
}

export async function createTrigger(
  workflowId: string,
  payload: CreateTriggerPayload,
  token: string,
): Promise<{ id: string }> {
  return apiClient<{ id: string }>('POST', `/api/workflows/${workflowId}/triggers`, payload, token);
}

export async function getTriggerDetail(triggerId: string, token: string): Promise<TriggerDetailResponse> {
  return apiClient<TriggerDetailResponse>('GET', `/api/triggers/${triggerId}`, undefined, token);
}

export async function updateTrigger(
  triggerId: string,
  payload: UpdateTriggerPayload,
  token: string,
): Promise<{ updated: boolean }> {
  return apiClient<{ updated: boolean }>('PUT', `/api/triggers/${triggerId}`, payload, token);
}

export async function pauseTrigger(triggerId: string, token: string): Promise<{ status: 'PAUSED' }> {
  return apiClient<{ status: 'PAUSED' }>('POST', `/api/triggers/${triggerId}/pause`, {}, token);
}

export async function resumeTrigger(triggerId: string, token: string): Promise<{ status: 'ACTIVE' }> {
  return apiClient<{ status: 'ACTIVE' }>('POST', `/api/triggers/${triggerId}/resume`, {}, token);
}

export async function disableTrigger(triggerId: string, token: string): Promise<{ status: 'DISABLED' }> {
  return apiClient<{ status: 'DISABLED' }>('POST', `/api/triggers/${triggerId}/disable`, {}, token);
}

export async function deleteTrigger(triggerId: string, token: string): Promise<void> {
  await apiClient<void>('DELETE', `/api/triggers/${triggerId}`, undefined, token);
}

export async function rotateTriggerToken(triggerId: string, token: string): Promise<{ webhook_token: string }> {
  return apiClient<{ webhook_token: string }>('POST', `/api/triggers/${triggerId}/rotate`, {}, token);
}
