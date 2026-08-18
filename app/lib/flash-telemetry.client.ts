import { toast } from "sonner";
import { logger } from "@/lib/logger.client";

/**
 * Flash telemetry: make transient error UI attributable after the fact.
 *
 * "An error flashed and disappeared" reports are unanswerable from server
 * logs when every request in the window is a 200 (issue: flash-telemetry).
 * This module captures the moment any error surface APPEARS — a sonner
 * `toast.error`/`toast.warning`, or any element with `role="alert"` entering
 * the DOM (the call screen's ErrorBanner among them) — and beacons it to
 * `POST /api/workspaces/:id/client-flash` together with a stack for the
 * toast call site and the most recent client breadcrumbs (dial presses, FSM
 * transitions, provider statuses). The server logs each event, so the next
 * flash is readable from the deployment's logs: exact message, exact code
 * path, and the state sequence that led to it.
 *
 * Design constraints:
 * - Zero UI change: observation only, errors here must never surface.
 * - Beacons only from inside a `/workspaces/:id/` URL — the endpoint is
 *   workspace-scoped (dataPlaneSessionAuth); flashes elsewhere still log to
 *   the console but have no workspace to attribute to.
 * - `navigator.sendBeacon` (fetch keepalive fallback) so a flash right
 *   before a navigation still ships.
 */

export type FlashBreadcrumb = {
  /** ms since page load, for cheap ordering without clock skew concerns. */
  t: number;
  kind: string;
  detail: string;
};

export type FlashEvent = {
  kind: "toast-error" | "toast-warning" | "alert-banner";
  message: string;
  stack?: string;
  breadcrumbs: FlashBreadcrumb[];
  url: string;
  ts: string;
};

const BREADCRUMB_LIMIT = 40;
const breadcrumbs: FlashBreadcrumb[] = [];

/** Record a client-state breadcrumb attached to any subsequent flash. */
export function recordFlashBreadcrumb(kind: string, detail: string): void {
  breadcrumbs.push({
    t: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
    kind,
    detail: detail.slice(0, 200),
  });
  if (breadcrumbs.length > BREADCRUMB_LIMIT) {
    breadcrumbs.splice(0, breadcrumbs.length - BREADCRUMB_LIMIT);
  }
}

function workspaceIdFromUrl(): string | null {
  const match = window.location.pathname.match(
    /\/workspaces\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1] ?? null;
}

function ship(event: FlashEvent): void {
  try {
    const workspaceId = workspaceIdFromUrl();
    // Always visible locally, even outside a workspace URL.
    logger.warn(`[flash] ${event.kind}: ${event.message}`);
    if (!workspaceId) return;

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/client-flash`;
    const body = JSON.stringify({ events: [event] });
    // sendBeacon survives imminent navigation; text/plain sidesteps the
    // CORS-preflight restriction on beacon content types (same-origin here,
    // but keepalive fetch is the fallback either way).
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    if (!sent) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch (error) {
    // Telemetry must never become the next bug report.
    logger.debug("flash telemetry ship failed", error);
  }
}

function captureFlash(
  kind: FlashEvent["kind"],
  message: string,
  stack?: string,
): void {
  ship({
    kind,
    message: message.slice(0, 500),
    stack: stack?.slice(0, 4000),
    breadcrumbs: [...breadcrumbs],
    url: window.location.pathname,
    ts: new Date().toISOString(),
  });
}

function messageText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message;
  // React nodes and objects: keep something greppable without exploding.
  try {
    return JSON.stringify(input)?.slice(0, 500) ?? String(input);
  } catch {
    return String(input);
  }
}

// Recently captured alert texts, to avoid re-shipping the same banner when a
// re-render replaces the node without the user seeing anything new.
const recentAlerts = new Map<string, number>();
const ALERT_DEDUPE_MS = 5_000;

function alertAppeared(node: Element): void {
  const text = (node.textContent ?? "").trim();
  if (!text) return;
  const now = Date.now();
  const last = recentAlerts.get(text);
  if (last != null && now - last < ALERT_DEDUPE_MS) return;
  recentAlerts.set(text, now);
  if (recentAlerts.size > 50) {
    const oldest = [...recentAlerts.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) recentAlerts.delete(oldest[0]);
  }
  captureFlash("alert-banner", text);
}

let installed = false;

/**
 * Install the flash observers. Idempotent; called once from entry.client.
 */
export function installFlashTelemetry(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // 1) Toast interception: same-module `toast` object the whole app imports;
  //    wrapping its methods observes every call site. The stack captured here
  //    names the caller — the single fact "which code fired this toast" that
  //    flash reports never contain.
  const originalError = toast.error.bind(toast);
  const originalWarning = toast.warning.bind(toast);
  toast.error = ((message: unknown, options?: unknown) => {
    captureFlash("toast-error", messageText(message), new Error().stack);
    return originalError(message as never, options as never);
  }) as typeof toast.error;
  toast.warning = ((message: unknown, options?: unknown) => {
    captureFlash("toast-warning", messageText(message), new Error().stack);
    return originalWarning(message as never, options as never);
  }) as typeof toast.warning;

  // 2) Any [role="alert"] APPEARING covers error UI that isn't a toast
  //    (ErrorBanner and friends) with zero changes to components. Appearance
  //    is the flash signal; sonner's own toasts are excluded (captured above
  //    with better fidelity).
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (!(added instanceof Element)) continue;
        if (added.closest?.("[data-sonner-toaster]")) continue;
        if (added.matches?.('[role="alert"]')) alertAppeared(added);
        added
          .querySelectorAll?.('[role="alert"]')
          .forEach((el) => {
            if (!el.closest("[data-sonner-toaster]")) alertAppeared(el);
          });
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true });
}
