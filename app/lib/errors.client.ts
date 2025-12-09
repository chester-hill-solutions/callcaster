/**
 * Client-side error handling utilities
 */

export interface ClientError {
  error: string;
  message?: string;
  details?: unknown;
  code?: string;
  statusCode?: number;
}

/**
 * Check if an error response is a standard error response
 */
export function isErrorResponse(error: unknown): error is ClientError {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as ClientError).error === "string"
  );
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorResponse(error)) {
    return error.message || error.error || "An error occurred";
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  return "An unexpected error occurred";
}

/**
 * Format error for display to user
 */
export function formatErrorForUser(error: unknown): string {
  const message = getErrorMessage(error);
  
  // Don't expose internal error details to users
  if (message.includes("ENOENT") || message.includes("ECONNREFUSED")) {
    return "A connection error occurred. Please try again.";
  }
  
  return message;
}

