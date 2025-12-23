import type { AppError } from "./types";

// Type-safe API response wrapper
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: AppError;
  success: boolean;
}

// Type-safe API client configuration
export interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

// Type-safe request options
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

// Type-safe API client class
export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  // Type-safe request method
  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.config.baseUrl}${endpoint}`;
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const requestOptions: RequestInit = {
        method: options.method || 'GET',
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...this.config.headers,
          ...options.headers,
        },
        signal: options.signal,
      };

      if (options.body) {
        requestOptions.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
      }

      const response = await fetch(url, requestOptions);
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.error || `HTTP ${response.status}`,
            code: `HTTP_${response.status}`,
            details: data,
          },
        };
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'NETWORK_ERROR',
          details: { originalError: error },
        },
      };
    }
  }

  // Convenience methods for common HTTP methods
  async get<T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = unknown>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T = unknown>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async delete<T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async patch<T = unknown>(endpoint: string, body: unknown, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }
}

// Create a default API client instance
export const apiClient = new ApiClient({
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Type-safe form submission utility
export async function submitForm<T = unknown>(
  formData: FormData,
  action: string,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<ApiResponse<T>> {
  return apiClient.post<T>(action, formData, options);
}

// Type-safe error handling utility
export function handleApiError<T>(response: ApiResponse<T>): T {
  if (!response.success || response.error) {
    throw new Error(response.error?.message || 'API request failed');
  }
  return response.data as T;
}

// Type-safe validation utility for API responses
export function validateApiResponse<T>(
  data: unknown,
  validator: (data: unknown) => data is T
): T {
  if (!validator(data)) {
    throw new Error('Invalid API response format');
  }
  return data;
} 