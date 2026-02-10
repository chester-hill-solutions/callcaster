import type { Json, AppError, ApiResponse } from "./types";
import { logger } from "@/lib/logger.client";

// Type guards for better runtime type checking
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isJson(value: unknown): value is Json {
  if (isString(value) || isNumber(value) || isBoolean(value) || isNull(value)) {
    return true;
  }
  if (isArray(value)) {
    return value.every(isJson);
  }
  if (isObject(value)) {
    return Object.values(value).every(isJson);
  }
  return false;
}

// Type-safe object property access
export function getProperty<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return obj[key];
}

export function hasProperty<T extends Record<string, unknown>, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}

// Safe JSON parsing with type checking
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    const parsed = JSON.parse(jsonString);
    return isJson(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

// Type-safe error handling
export function createAppError(message: string, code?: string, details?: Record<string, unknown>): AppError {
  return {
    message,
    code,
    details,
  };
}

export function isAppError(error: unknown): error is AppError {
  return isObject(error) && isString((error as AppError).message);
}

// Type-safe API response helpers
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function createErrorResponse<T>(error: AppError): ApiResponse<T> {
  return { data: null, error };
}

export function isSuccessResponse<T>(response: ApiResponse<T>): response is { data: T; error: null } {
  return response.error === null;
}

export function isErrorResponse<T>(response: ApiResponse<T>): response is { data: null; error: AppError } {
  return response.error !== null;
}

// Type-safe array operations
export function filterNonNull<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item != null);
}

export function mapNonNull<T, U>(
  array: T[],
  mapper: (item: T) => U | null | undefined
): U[] {
  return filterNonNull(array.map(mapper));
}

// Type-safe optional chaining with fallback
export function optionalChain<T, U>(
  value: T | null | undefined,
  accessor: (value: T) => U,
  fallback: U
): U {
  return value != null ? accessor(value) : fallback;
}

// Type-safe string operations
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
  return "";
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
    return value.toLowerCase() === "true";
  }
  if (isNumber(value)) {
    return value !== 0;
  }
  return false;
}

// Type-safe date operations
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
  return date ? date.toLocaleDateString() : "Invalid Date";
}

// Type-safe object merging
export function mergeObjects<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  return { ...target, ...source };
}

// Type-safe deep clone for JSON-serializable objects
export function deepClone<T extends Json>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Type-safe validation helpers
export function validateRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value == null) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

export function validateString(value: unknown, fieldName: string): string {
  const result = safeString(value);
  if (result === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return result;
}

export function validateNumber(value: unknown, fieldName: string): number {
  const result = safeNumber(value);
  if (isNaN(result)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return result;
}

// Type-safe async operation wrapper
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error("Async operation failed:", error);
    return fallback;
  }
}

// Type-safe debounce with proper typing
export function debounce<T extends unknown[]>(
  func: (...args: T) => void,
  delay: number
): (...args: T) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Type-safe throttle with proper typing
export function throttle<T extends unknown[]>(
  func: (...args: T) => void,
  delay: number
): (...args: T) => void {
  let lastCall = 0;
  return (...args: T) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
} 