import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toUserMessage } from "@/lib/user-message";

const FALLBACK_MESSAGE =
  "Something went wrong. Please try again or contact support if the problem persists.";

/** Route-module ErrorBoundary compatible with React Router 7 typegen. */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="min-h-[12rem] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <h3 className="text-lg font-medium text-foreground">Page not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or may have moved.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.history.back()}
            className="mt-4"
          >
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : toUserMessage(error, FALLBACK_MESSAGE);

  return (
    <div className="min-h-[12rem] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h3 className="text-lg font-medium text-foreground">
          Something went wrong
        </h3>
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="destructive"
          onClick={() => window.location.reload()}
          className="mt-4"
        >
          Reload Page
        </Button>
      </div>
    </div>
  );
}
