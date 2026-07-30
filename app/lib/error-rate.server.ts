/**
 * Rolling in-process 5xx counter.
 *
 * There are no metrics in this stack and no Sentry DSN, so nothing distinguishes
 * "one user hit a bug" from "everything is broken since the last deploy". This
 * is the cheapest thing that does: one integer increment per server error, no
 * database, no network.
 *
 * Counting per replica is deliberate — the question worth paging on is "is ANY
 * replica on fire", and a per-replica count answers it without coordination.
 */
import { logger } from "@/lib/logger.server";

const WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 25;

let windowStartedAt = Date.now();
let count = 0;
/** Set when the current window has already alerted, so one burst pages once. */
let alertedForWindow = false;

type ErrorRateHandler = (info: {
  count: number;
  windowMs: number;
}) => void | Promise<void>;

let onThresholdCrossed: ErrorRateHandler | null = null;

/**
 * Register the alert sink. Kept as a setter rather than a direct import so this
 * module stays dependency-free and safe to call from an error path.
 */
export function setErrorRateHandler(handler: ErrorRateHandler | null): void {
  onThresholdCrossed = handler;
}

export function recordServerError(): void {
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    count = 0;
    alertedForWindow = false;
  }

  count += 1;
  if (count < ALERT_THRESHOLD || alertedForWindow) {
    return;
  }

  alertedForWindow = true;
  try {
    const result = onThresholdCrossed?.({ count, windowMs: WINDOW_MS });
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // An alerting failure must never propagate into the request that happened
    // to be the Nth error.
  }
  logger.error("web.error_rate_elevated", {
    count,
    windowMinutes: WINDOW_MS / 60_000,
  });
}

/** Test helper. */
export function resetErrorRateForTests(): void {
  windowStartedAt = Date.now();
  count = 0;
  alertedForWindow = false;
  onThresholdCrossed = null;
}
