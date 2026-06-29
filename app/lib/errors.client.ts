/**
 * Client-side error handling utilities
 */

import type { ErrorPayload } from "./type-safety-utils";

/**
 * Check if an error response is a standard error payload
 */
export function isErrorResponse(error: unknown): error is ErrorPayload {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as ErrorPayload).error === "string"
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

