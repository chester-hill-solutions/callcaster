import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Heading, Text } from "@/components/ui/typography";
import { toResponseMessage, toUserMessage } from "@/lib/user-message";

const FALLBACK_MESSAGE =
  "Something went wrong. Please try again or contact support if the problem persists.";

/** Route-module ErrorBoundary compatible with React Router 7 typegen. */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (
    isRouteErrorResponse(error) &&
    (error.status === 401 || error.status === 403)
  ) {
    const signIn = error.status === 401;
    const message = toResponseMessage(
      error.data,
      signIn
        ? "Sign in to continue to this page."
        : "You don't have permission to view this page. Contact your workspace administrator if you need access.",
    );

    return (
      <div className="flex min-h-48 items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <Heading as="h3" level={4}>
            {signIn ? "Sign in required" : "Access denied"}
          </Heading>
          <Text variant="muted" className="mt-2">
            {message}
          </Text>
          <Button asChild variant="outline" className="mt-4">
            <Link to={signIn ? "/signin" : "/workspaces"}>
              {signIn ? "Sign in" : "Go to workspaces"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

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
    ? toResponseMessage(error.data, `${error.status} ${error.statusText}`)
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
