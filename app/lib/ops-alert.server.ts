/**
 * Ops alerting for events a human must act on.
 *
 * There is no Sentry DSN and no metrics backend, so the only channel that
 * actually reaches someone is the Resend ops mailbox already used for Twilio
 * compliance. This generalises it.
 *
 * Ordering is deliberate and is the whole degradation story:
 *   1. log FIRST — the alert survives even when Resend and Postgres are both
 *      down, and JSON logs are queryable (see logger-core).
 *   2. captureException — a no-op until a DSN exists, free when one appears.
 *   3. in-memory dedupe BEFORE any DB call — this is what makes the helper safe
 *      to call from a crash handler when Postgres is the broken thing.
 *   4. cross-process dedupe via the DB-backed rate limiter, fail-open.
 *   5. a global cap, so a high-cardinality key can never mail hundreds of times.
 *
 * Never throws.
 */
import { captureException } from "@/lib/sentry.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export type OpsAlertSeverity = "page" | "warn";

export type OpsAlertInput = {
  /** Stable dotted key, e.g. "worker.job.dead_letter". Also the default dedupe key. */
  event: string;
  summary: string;
  /** "warn" logs and reports but does not email. */
  severity?: OpsAlertSeverity;
  dedupeKey?: string;
  dedupeWindowMs?: number;
  workspaceId?: string | null;
  jobId?: number | string | null;
  jobType?: string | null;
  error?: unknown;
  context?: Record<string, unknown>;
};

export type OpsAlertResult = {
  sent: boolean;
  reason?: "deduped" | "disabled" | "no_recipient" | "capped" | "send_failed";
};

const DEFAULT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;
/** Backstop against a high-cardinality dedupe key slipping in. */
const GLOBAL_CAP_PER_HOUR = 10;

const recentAlerts = new Map<string, number>();

function inMemoryDeduped(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = recentAlerts.get(key);
  if (last !== undefined && now - last < windowMs) {
    return true;
  }
  recentAlerts.set(key, now);
  // Bound the map: entries older than the longest plausible window are useless.
  if (recentAlerts.size > 500) {
    for (const [k, at] of recentAlerts) {
      if (now - at > DEFAULT_DEDUPE_WINDOW_MS) recentAlerts.delete(k);
    }
  }
  return false;
}

/** Emails only from real production; PR previews run this same code. */
function emailsEnabled(): boolean {
  if (process.env.E2E_TEST === "1" || process.env.VITEST === "true") return false;
  if (process.env.OPS_ALERT_EMAILS_ENABLED === "false") return false;
  return process.env.NODE_ENV === "production";
}

function recipient(): string | null {
  const explicit = process.env.OPS_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  const fallback = env.TWILIO_COMPLIANCE_NOTIFY_EMAIL();
  return fallback && fallback.trim() ? fallback.trim() : null;
}

function buildBody(input: OpsAlertInput, suppressedFor: number): {
  subject: string;
  text: string;
  html: string;
} {
  const base = process.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const links: string[] = [];
  if (input.workspaceId) {
    links.push(`Workspace: ${base}/admin/workspaces/${input.workspaceId}`);
  }
  if (input.jobId != null) {
    links.push(`Dead letters: ${base}/admin/dead-letters`);
  }

  const detail = [
    `Event: ${input.event}`,
    input.jobType ? `Job type: ${input.jobType}` : null,
    input.jobId != null ? `Job id: ${input.jobId}` : null,
    input.workspaceId ? `Workspace: ${input.workspaceId}` : null,
    process.env.RAILWAY_GIT_COMMIT_SHA
      ? `Release: ${process.env.RAILWAY_GIT_COMMIT_SHA}`
      : null,
    input.error instanceof Error ? `Error: ${input.error.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const footer =
    `\nFurther occurrences of "${input.dedupeKey ?? input.event}" are suppressed ` +
    `for ${Math.round(suppressedFor / 60000)} minutes — this email is not a count of one.`;

  return {
    subject: `[CallCaster ops] ${input.summary}`,
    text: `${input.summary}\n\n${detail}\n\n${links.join("\n")}\n${footer}`,
    html:
      `<div style="font-family: Arial, sans-serif; max-width: 640px;">` +
      `<h2>${input.summary}</h2><pre>${detail}</pre>` +
      links.map((l) => `<p>${l}</p>`).join("") +
      `<p style="color:#666">${footer}</p></div>`,
  };
}

export async function notifyOps(input: OpsAlertInput): Promise<OpsAlertResult> {
  const severity = input.severity ?? "page";
  const dedupeKey = input.dedupeKey ?? input.event;
  const windowMs = input.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;

  // 1. Always log, before anything that can fail.
  logger.error("ops.alert", {
    event: input.event,
    summary: input.summary,
    severity,
    workspaceId: input.workspaceId ?? null,
    jobId: input.jobId ?? null,
    jobType: input.jobType ?? null,
    ...(input.context ?? {}),
    ...(input.error instanceof Error ? { err: input.error } : {}),
  });

  // 2. Free when a DSN eventually exists.
  captureException(input.error ?? new Error(input.summary), {
    event: input.event,
    workspaceId: input.workspaceId ?? null,
  });

  if (severity === "warn") return { sent: false, reason: "disabled" };

  // 3. In-memory dedupe first — no I/O, safe inside a crash handler.
  if (inMemoryDeduped(`alert:${dedupeKey}`, windowMs)) {
    return { sent: false, reason: "deduped" };
  }

  if (!emailsEnabled()) return { sent: false, reason: "disabled" };

  const to = recipient();
  if (!to) {
    logger.warn("ops.alert.no_recipient", { event: input.event });
    return { sent: false, reason: "no_recipient" };
  }

  // 4/5. Cross-process dedupe + global cap.
  //
  // This is load-bearing, not belt-and-braces: the in-memory map above dies
  // with the process, and a crash-looping worker restarts constantly — so
  // without a durable check, one incident mails on every restart. That
  // happened. Consequently this must FAIL CLOSED when the store is
  // unreachable: an alert nobody can dedupe is worse than a missed one,
  // because the log line has already been written either way.
  let dedupeStoreReachable = false;
  try {
    const { checkRateLimit } = await import("@/lib/platform-rate-limit.server");
    const perKey = await checkRateLimit({
      key: `ops:alert:${dedupeKey}`,
      limit: 1,
      windowMs,
    });
    dedupeStoreReachable = true;
    if (!perKey.ok) return { sent: false, reason: "deduped" };

    const global = await checkRateLimit({
      key: "ops:alert:global",
      limit: GLOBAL_CAP_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (!global.ok) {
      logger.error("ops.alert.capped", { event: input.event });
      return { sent: false, reason: "capped" };
    }
  } catch (error) {
    logger.error("ops.alert.dedupe_unavailable", {
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!dedupeStoreReachable) {
    // The alert is already in the logs; suppress the email rather than risk
    // one email per restart of a crash-looping process.
    return { sent: false, reason: "capped" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY());
    const { subject, text, html } = buildBody(input, windowMs);
    await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [to],
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (error) {
    logger.error("ops.alert.email_failed", {
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "send_failed" };
  }
}

/** Test helper — clears the in-memory dedupe map. */
export function resetOpsAlertsForTests(): void {
  recentAlerts.clear();
}
