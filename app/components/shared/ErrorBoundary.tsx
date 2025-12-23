<<<<<<< HEAD:app/components/shared/ErrorBoundary.tsx
import React, { useEffect, useState } from "react";
import {
  isRouteErrorResponse,
  useFetcher,
  useNavigate,
  useRouteError,
} from "@remix-run/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
=======
import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { AppError } from '~/lib/types';
import { createAppError } from '~/lib/type-utils';
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ErrorBoundary.tsx

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: AppError) => ReactNode);
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Convert the error to our AppError type
    const appError: AppError = createAppError(
      error.message || 'An unexpected error occurred',
      error.name,
      {
        stack: error.stack,
        cause: error.cause,
      }
    );

    return {
      hasError: true,
      error: appError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Convert the error to our AppError type
    const appError: AppError = createAppError(
      error.message || 'An unexpected error occurred',
      error.name,
      {
        stack: error.stack,
        cause: error.cause,
        componentStack: errorInfo.componentStack,
      }
    );

    // Log the error
    console.error('ErrorBoundary caught an error:', appError);
    console.error('Error info:', errorInfo);

    // Call the onError callback if provided
    this.props.onError?.(appError, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      const { fallback } = this.props;

      if (typeof fallback === 'function') {
        return fallback(error!);
      }

      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-lg font-medium text-gray-900">
                Something went wrong
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {error?.message || 'An unexpected error occurred'}
              </p>
              {error?.code && (
                <p className="mt-1 text-xs text-gray-400">
                  Error code: {error.code}
                </p>
              )}
              <button
                onClick={() => window.location.reload()}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Type-safe error boundary hook for functional components
export function useErrorHandler() {
  const handleError = React.useCallback((error: Error, context?: string) => {
    const appError: AppError = createAppError(
      error.message || 'An unexpected error occurred',
      error.name,
      {
        stack: error.stack,
        cause: error.cause,
        context,
      }
    );

    console.error('Error handled by useErrorHandler:', appError);
    
    // You can add additional error reporting logic here
    // For example, sending to an error reporting service
    
    return appError;
  }, []);

  return { handleError };
}

// Type-safe error boundary wrapper for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}