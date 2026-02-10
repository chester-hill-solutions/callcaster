/**
 * Type Safety Utilities
 * 
 * This file provides common type-safe patterns and utilities for the Callcaster application.
 * These utilities help eliminate `any` types and provide better type safety throughout the app.
 */

import type { Database } from './database.types';
import { logger } from '@/lib/logger.client';

// Type-safe error handling
export interface AppError {
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
): AppError {
  return {
    message,
    code,
    details,
    originalError,
  };
}

// Type-safe API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: AppError;
  success: boolean;
}

export function createApiResponse<T>(
  data?: T,
  error?: AppError
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

// Type-safe environment variable access
export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value;
}

export function getOptionalEnvVar(key: string): string | undefined {
  return process.env[key];
}

// Type-safe Supabase client typing
export type SupabaseClient = import('@supabase/supabase-js').SupabaseClient<Database>;

// Type-safe Twilio client typing
export type TwilioClient = import('twilio').Twilio;

// Type-safe form data handling
export function parseFormData<T extends Record<string, unknown>>(
  formData: FormData,
  schema: Record<keyof T, (value: string) => unknown>
): T {
  const result = {} as T;
  
  for (const [key, value] of formData.entries()) {
    if (key in schema) {
      const parser = schema[key as keyof T];
      result[key as keyof T] = parser(value) as T[keyof T];
    }
  }
  
  return result;
}

// Type-safe JSON parsing
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Type-safe object property access
export function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

export function hasProperty<T, K extends keyof T>(obj: T, key: K): obj is T & Record<K, unknown> {
  return key in obj;
}

// Type-safe array operations
export function filterArray<T>(
  array: T[],
  predicate: (item: T, index: number) => boolean
): T[] {
  return array.filter(predicate);
}

export function mapArray<T, U>(
  array: T[],
  mapper: (item: T, index: number) => U
): U[] {
  return array.map(mapper);
}

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
  onInput: (event: React.InputEvent<HTMLInputElement>) => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}

// Type-safe state management
export interface TypedState<T> {
  value: T;
  setValue: (value: T | ((prev: T) => T)) => void;
}

// Type-safe validation
export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

export function validateValue<T>(
  value: T,
  rules: ValidationRule<T>[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
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

// Type-safe performance monitoring
export interface PerformanceMetrics {
  duration: number;
  memoryUsage?: number;
  timestamp: number;
}

export function measurePerformance<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const start = performance.now();
  const startMemory = (performance as typeof performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  
  return operation().then(result => {
    const end = performance.now();
    const endMemory = (performance as typeof performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    
    const metrics: PerformanceMetrics = {
      duration: end - start,
      memoryUsage: endMemory && startMemory ? endMemory - startMemory : undefined,
      timestamp: Date.now(),
    };
    
    logger.debug(`Performance: ${name}`, metrics);
    
    return { result, metrics };
  });
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
  
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
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