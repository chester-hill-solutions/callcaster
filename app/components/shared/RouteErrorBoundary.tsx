import { isRouteErrorResponse, useRouteError } from "react-router";

/** Route-module ErrorBoundary compatible with React Router 7 typegen. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred";

  return (
    <div className="min-h-[12rem] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Something went wrong
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
