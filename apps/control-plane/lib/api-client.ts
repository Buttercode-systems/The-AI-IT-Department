/**
 * API client with resilience features:
 * - Automatic retry with exponential backoff
 * - Request timeouts
 * - Better error handling
 * - Network failure detection
 */

import { createSupabaseBrowserClient } from './supabase';

interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isServerError?: boolean;
}

const DEFAULT_OPTIONS: ApiClientOptions = {
  timeout: 15000, // 15 seconds
  retries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
};

class ApiClient {
  private options: Required<ApiClientOptions>;
  private supabase = createSupabaseBrowserClient();

  constructor(options: ApiClientOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private async getAccessToken(): Promise<string> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error('SESSION_EXPIRED');
    }
    return data.session.access_token;
  }

  private async makeRequest<T>(
    path: string,
    method: 'GET' | 'POST' = 'POST',
    body?: unknown,
    attempt: number = 1
  ): Promise<ApiResponse<T>> {
    try {
      const token = await this.getAccessToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
      };

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      const response = await fetch(path, init);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        let error = 'Request failed';
        let code = `HTTP_${response.status}`;

        try {
          const json = JSON.parse(text);
          error = json.error?.replaceAll('_', ' ') || error;
          code = json.error || code;
        } catch {
          error = text || error;
        }

        // Retry on 5xx or timeout
        if (response.status >= 500 && attempt < this.options.retries) {
          const delay = this.options.retryDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest<T>(path, method, body, attempt + 1);
        }

        return {
          error,
          code,
          isServerError: response.status >= 500,
        };
      }

      const json = (await response.json()) as T & { error?: string };
      return { data: json as T };
    } catch (err) {
      const isNetworkError = err instanceof TypeError;
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';

      // Retry on network errors (except on last attempt)
      if (isNetworkError && attempt < this.options.retries) {
        const delay = this.options.retryDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest<T>(path, method, body, attempt + 1);
      }

      if (isTimeout) {
        return {
          error: 'Request took too long. Please try again.',
          code: 'TIMEOUT',
          isTimeout: true,
        };
      }

      if (isNetworkError) {
        return {
          error: 'Network error. Check your connection and try again.',
          code: 'NETWORK_ERROR',
          isNetworkError: true,
        };
      }

      return {
        error: err instanceof Error ? err.message : 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
      };
    }
  }

  async get<T>(path: string, options?: ApiClientOptions): Promise<ApiResponse<T>> {
    const opts = { ...this.options, ...options };
    const client = new ApiClient(opts);
    return client.makeRequest<T>(path, 'GET');
  }

  async post<T>(path: string, body?: unknown, options?: ApiClientOptions): Promise<ApiResponse<T>> {
    const opts = { ...this.options, ...options };
    const client = new ApiClient(opts);
    return client.makeRequest<T>(path, 'POST', body);
  }
}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}

export { ApiResponse, ApiClientOptions };
