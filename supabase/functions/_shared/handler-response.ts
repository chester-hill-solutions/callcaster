import type { HandlerOutcome } from "./queue-policy.ts";

type HandlerResponseBody = {
  outcome: HandlerOutcome;
  success?: boolean;
  error?: string;
  reason?: string;
};

export function jsonHandlerResponse(
  outcome: HandlerOutcome,
  args: {
    status?: number;
    error?: string;
    reason?: string;
    extra?: Record<string, unknown>;
  } = {},
): Response {
  const status =
    args.status ??
    (outcome === "success" || outcome === "skipped"
      ? 200
      : outcome === "retryable_failure"
        ? 503
        : 422);

  const body: HandlerResponseBody = {
    outcome,
    success: outcome === "success" || outcome === "skipped",
    ...(args.error ? { error: args.error } : {}),
    ...(args.reason ? { reason: args.reason } : {}),
    ...(args.extra ?? {}),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function parseHandlerOutcome(response: Response, bodyText: string): HandlerOutcome {
  try {
    const parsed = JSON.parse(bodyText) as HandlerResponseBody;
    if (
      parsed.outcome === "success" ||
      parsed.outcome === "skipped" ||
      parsed.outcome === "retryable_failure" ||
      parsed.outcome === "permanent_failure"
    ) {
      return parsed.outcome;
    }
    if (parsed.success === true) {
      return "success";
    }
  } catch {
    // fall through
  }

  if (response.ok) {
    return "success";
  }
  if (response.status === 503) {
    return "retryable_failure";
  }
  return "permanent_failure";
}
