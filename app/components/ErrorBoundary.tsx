import React, { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from '@remix-run/react';
import { toast } from 'sonner';

export function ErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    let errorMessage = 'An unexpected error occurred';
    
    if (isRouteErrorResponse(error)) {
      errorMessage = error.data.message || `${error.status} ${error.statusText}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    toast.error('Error', {
      description: errorMessage,
      duration: 5000,
    });
  }, [error]);

  return (
    <div className="error-container">
      <h1>Oops! Something went wrong.</h1>
      <p>We've been notified and are working on the issue.</p>
    </div>
  );
}