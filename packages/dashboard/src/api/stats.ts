import { apiClient } from './client.ts';

export interface StatsDto {
  queueDepth: number;
  activeWorkers: number;
  dlqDepth: number;
  jobsLastHour: number;
  failureRate: number;
}

export async function getStats(token: string): Promise<StatsDto> {
  return apiClient<StatsDto>('GET', '/api/stats', undefined, token);
}
