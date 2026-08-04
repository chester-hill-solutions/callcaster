/**
 * Type Safety Utilities
 * 
 * This file provides common type-safe patterns and utilities for the Callcaster application.
 * These utilities help eliminate `any` types and provide better type safety throughout the app.
 */

import type { Database, Json } from '@/lib/db-types';
import { logger } from '@/lib/logger.client';

// Type-safe error handling
export interface AppErrorShape {
  message: string;
  code: string;
  details?: Record<string, unknown>;
  originalError?: unknown;
}

export function createAppError(
  message: string,
  code: string,
  details?: Record<string, unknown>,
  originalError?: unknown
): AppErrorShape {
  return {
    message,
    code,
    details,
    originalError,
  };
}

// Standard error payload shared by server and client error responses
export interface ErrorPayload {
  error: string;
  message?: string;
  details?: unknown;
  code?: string;
  statusCode: number;
}

// Type-safe API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: AppErrorShape;
  success: boolean;
}

export function createApiResponse<T>(
  data?: T,
  error?: AppErrorShape
): ApiResponse<T> {
  return {
    data,
    error,
    success: !error,
  };
}

// Type-safe runtime type validation
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// Type-safe Postgres client typing (deprecated with Drizzle migration)

// Type-safe Twilio client typing
export type TwilioClient = import('twilio').Twilio;


// Type-safe async operations
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch {
    return fallback;
  }
}

// Type-safe event handling
export interface TypedEventHandlers {
  onInput: (event: React.FormEvent<HTMLInputElement>) => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}

// Type-safe state management
export interface TypedState<T> {
  value: T;
  setValue: (value: T | ((prev: T) => T)) => void;
}

// Type-safe database operations
export interface DatabaseOperation<T> {
  execute: () => Promise<{ data: T | null; error: unknown }>;
  validate?: (data: T) => boolean;
}

export async function executeDatabaseOperation<T>(
  operation: DatabaseOperation<T>
): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await operation.execute();
    
    if (error) {
      return createApiResponse<T>(undefined, createAppError(
        'Database operation failed',
        'DATABASE_ERROR',
        { originalError: error }
      ));
    }
    
    if (data && operation.validate && !operation.validate(data)) {
      return createApiResponse<T>(undefined, createAppError(
        'Data validation failed',
        'VALIDATION_ERROR'
      ));
    }
    
    return createApiResponse<T>(data || undefined);
  } catch (error) {
    return createApiResponse<T>(undefined, createAppError(
      'Unexpected error',
      'UNEXPECTED_ERROR',
      { originalError: error }
    ));
  }
}

// Type-safe webhook handling
export interface WebhookPayload {
  event_category: string;
  event_type: string;
  workspace_id: string;
  payload: Record<string, unknown>;
}

export function createWebhookPayload(
  eventCategory: string,
  eventType: string,
  workspaceId: string,
  payload: Record<string, unknown>
): WebhookPayload {
  return {
    event_category: eventCategory,
    event_type: eventType,
    workspace_id: workspaceId,
    payload,
  };
}

// Type-safe utility functions
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

// Type-safe deep clone
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

// Type-safe null coalescing
export function coalesce<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

// Type-safe optional chaining with fallback
export function getNestedValue<T>(
  obj: unknown,
  path: string[],
  fallback: T
): T {
  let current = obj;
  
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return fallback;
    }
  }
  
  return current as T;
}

// Type-safe scalar coercions (folded from type-utils)
export function safeString(value: unknown): string {
  if (isString(value)) {
    return value;
  }
  if (isNumber(value)) {
    return value.toString();
  }
  if (isBoolean(value)) {
    return value.toString();
  }
  return '';
}

export function safeNumber(value: unknown): number {
  if (isNumber(value)) {
    return value;
  }
  if (isString(value)) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function safeBoolean(value: unknown): boolean {
  if (isBoolean(value)) {
    return value;
  }
  if (isString(value)) {
    return value.toLowerCase() === 'true';
  }
  if (isNumber(value)) {
    return value !== 0;
  }
  return false;
}

export function safeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (isString(value) || isNumber(value)) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function formatDate(value: unknown): string {
  const date = safeDate(value);
  return date ? date.toLocaleDateString() : 'Invalid Date';
} 