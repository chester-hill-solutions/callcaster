import { json, redirect } from "@remix-run/node";
import { logger } from "@/lib/logger.server";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  code?: string;
  statusCode: number;
}

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  
  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",
  
  // Not Found
  NOT_FOUND = "NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  
  // Database
  DATABASE_ERROR = "DATABASE_ERROR",
  QUERY_ERROR = "QUERY_ERROR",
  
  // External Services
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  TWILIO_ERROR = "TWILIO_ERROR",
  SUPABASE_ERROR = "SUPABASE_ERROR",
  
  // Server
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  TIMEOUT = "TIMEOUT",
  
  // Business Logic
  INVALID_OPERATION = "INVALID_OPERATION",
  CONFLICT = "CONFLICT",
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON(): ErrorResponse {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = "An error occurred",
  defaultStatusCode: number = 500,
  options?: { headers?: Headers }
): Response {
  let errorResponse: ErrorResponse;

  if (error instanceof AppError) {
    errorResponse = {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
    };
  } else if (error instanceof Error) {
    errorResponse = {
      error: error.message || defaultMessage,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      statusCode: defaultStatusCode,
    };
  } else if (typeof error === "object" && error !== null && "message" in error) {
    errorResponse = {
      error: String(error.message) || defaultMessage,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      statusCode: defaultStatusCode,
    };
  } else {
    errorResponse = {
      error: defaultMessage,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      statusCode: defaultStatusCode,
    };
  }

  logger.error("Error response:", errorResponse, error);

  return json(errorResponse, { status: errorResponse.statusCode, headers: options?.headers });
}

/**
 * Handle database errors
 */
export function handleDatabaseError(error: PostgrestError | null, context?: string): never {
  if (!error) {
    throw new AppError(
      "Database operation failed",
      500,
      ErrorCode.DATABASE_ERROR
    );
  }

  const contextMessage = context ? `${context}: ` : "";
  
  // Map common Postgres errors to appropriate status codes
  let statusCode = 500;
  let code = ErrorCode.DATABASE_ERROR;

  if (error.code === "23505") {
    // Unique constraint violation
    statusCode = 409;
    code = ErrorCode.CONFLICT;
  } else if (error.code === "23503") {
    // Foreign key violation
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
  } else if (error.code === "PGRST116") {
    // Not found
    statusCode = 404;
    code = ErrorCode.NOT_FOUND;
  }

  throw new AppError(
    `${contextMessage}${error.message}`,
    statusCode,
    code,
    { postgresCode: error.code, details: error.details }
  );
}

/**
 * Handle authentication errors
 */
export function handleAuthError(message: string = "Authentication required"): Response {
  throw redirect("/signin", {
    headers: {
      "X-Error": encodeURIComponent(message),
    },
  });
}

/**
 * Handle validation errors
 */
export function handleValidationError(
  message: string,
  details?: unknown
): never {
  throw new AppError(message, 400, ErrorCode.VALIDATION_ERROR, details);
}

/**
 * Handle not found errors
 */
export function handleNotFoundError(
  resource: string = "Resource",
  id?: string | number
): never {
  const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
  throw new AppError(message, 404, ErrorCode.NOT_FOUND);
}

/**
 * Handle external service errors (Twilio, etc.)
 */
export function handleExternalServiceError(
  service: string,
  error: unknown,
  context?: string
): never {
  const contextMessage = context ? `${context}: ` : "";
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  throw new AppError(
    `${contextMessage}${service} service error: ${errorMessage}`,
    502,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    { service, originalError: error }
  );
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      const contextMessage = context ? `${context}: ` : "";
      logger.error(`${contextMessage}Unexpected error:`, error);
      
      throw new AppError(
        `${contextMessage}An unexpected error occurred`,
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }) as T;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.error("Failed to parse JSON:", error);
    return fallback;
  }
}

