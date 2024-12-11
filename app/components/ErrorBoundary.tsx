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
} from "./ui/dialog";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

const getDetails = (error) => {
  let title = "An error occurred";
  let description = "We're sorry, but something went wrong.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    description = error.data;
  } else if (error instanceof Error) {
    description = error.message;
  }
  return { ...error, title, description };
};

const MAX_ATTEMPTS = 3;
const FALLBACK_URL = "/signin";
const ATTEMPTS_KEY = "errorReportAttempts";

export function ErrorBoundary() {
  const routeError = useRouteError();
  const [isOpen, setIsOpen] = useState(true);
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const getAttempts = () => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem(ATTEMPTS_KEY) || "0", 10);
    }
    return 0;
  };

  const incrementAttempts = () => {
    if (typeof window !== "undefined") {
      const currentAttempts = getAttempts();
      localStorage.setItem(ATTEMPTS_KEY, (currentAttempts + 1).toString());
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    navigateToPreviousOrFallback();
  };

  const navigateToPreviousOrFallback = () => {
    if (getAttempts() >= MAX_ATTEMPTS) {
      window.location.href = FALLBACK_URL;
    } else {
      window.location.href = document.referrer || "/signin";
    }
  };

  const sendErrorReport = () => {
    incrementAttempts();
    fetcher.submit(
      {
        ...getDetails(routeError),
        ...(routeError instanceof Error && {
          stack: routeError.stack,
        }),
      },
      {
        action: "/api/error-report",
        method: "POST",
        encType: "application/json",
      },
    );
  };

  useEffect(() => {
    if (fetcher.data && fetcher.data.success) {
      toast.success("Error sent successfully.", { duration: 2000 });
      const timer = setTimeout(() => {
        setIsOpen(false);
        navigateToPreviousOrFallback();
      }, 2000);
      return () => clearTimeout(timer);
    } else if (fetcher.data && !fetcher.data.success) {
      toast.error("Failed to send error report. Please try again.", { duration: 2000 });
    }
  }, [fetcher.data]);

  const { title, description } = getDetails(routeError);
  const attempts = getAttempts();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="bg-slate-200 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center text-destructive">
            <AlertCircle className="mr-2 h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {routeError instanceof Error && (
          <div className="mt-2 max-h-[200px] overflow-auto rounded bg-muted p-2">
            <pre className="text-sm">{routeError.stack}</pre>
          </div>
        )}
        <DialogFooter className="sm:justify-start">
          <Button 
            variant="secondary" 
            onClick={sendErrorReport}
            disabled={attempts >= MAX_ATTEMPTS}
          >
            {attempts >= MAX_ATTEMPTS ? "Max attempts reached" : "Send Error Report"}
          </Button>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}