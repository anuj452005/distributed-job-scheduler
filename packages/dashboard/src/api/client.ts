export interface ApiValidationErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: ApiValidationErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ApiValidationErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_BASE = 'http://localhost:3000';

export async function apiClient<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 204) {
      return {} as T;
    }

    const resData = await response.json();

    if (!response.ok) {
      const errCode = resData.error?.code || 'API_ERROR';
      const errMsg = resData.error?.message || `HTTP Error ${response.status}`;
      const errDetails = resData.error?.details as ApiValidationErrorDetail[] | undefined;
      
      throw new ApiError(response.status, errCode, errMsg, errDetails);
    }

    // Always returns 'data' from { data: T } responses
    return resData.data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(500, 'CONNECTION_ERROR', err.message || 'Network connection failed');
  }
}
