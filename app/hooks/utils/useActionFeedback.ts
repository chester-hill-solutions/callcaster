import { useEffect, useRef } from "react";
import { toast } from "sonner";

type ActionFeedbackOptions<T> = {
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
  successMessage?: string | ((data: T) => string);
  errorMessage?: string | ((error: unknown) => string);
  getError?: (data: T) => unknown;
  getWarning?: (data: T) => unknown;
  warningMessage?: string | ((data: T) => string);
  getSuccess?: (data: T) => boolean;
};

function resolveMessage<T>(
  message: string | ((data: T) => string) | undefined,
  data: T,
): string | undefined {
  if (message == null) return undefined;
  return typeof message === "function" ? message(data) : message;
}

export function useActionFeedback<T>(
  actionData: T | undefined,
  {
    enabled = true,
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    getError = (data) =>
      data != null && typeof data === "object" && "error" in data
        ? (data as { error?: unknown }).error
        : undefined,
    getWarning,
    warningMessage,
    getSuccess = (data) =>
      data != null &&
      typeof data === "object" &&
      "success" in data &&
      Boolean((data as { success?: boolean }).success),
  }: ActionFeedbackOptions<T> = {},
): void {
  const lastHandledRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!enabled || actionData == null || actionData === lastHandledRef.current) {
      return;
    }
    lastHandledRef.current = actionData;

    const warning = getWarning?.(actionData);
    if (warning != null && warning !== false && warning !== "") {
      const message =
        resolveMessage(warningMessage, actionData) ??
        (typeof warning === "string" ? warning : String(warning));
      toast.warning(message);
      return;
    }

    const error = getError(actionData);
    if (error != null && error !== false && error !== "") {
      const message =
        resolveMessage(errorMessage, actionData) ??
        (typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : String(error));
      toast.error(message);
      onError?.(error);
      return;
    }

    if (getSuccess(actionData)) {
      const message = resolveMessage(successMessage, actionData);
      if (message) {
        toast.success(message);
      }
      onSuccess?.(actionData);
    }
  }, [
    actionData,
    enabled,
    errorMessage,
    getError,
    getWarning,
    warningMessage,
    getSuccess,
    onError,
    onSuccess,
    successMessage,
  ]);
}
