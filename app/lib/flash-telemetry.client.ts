import { toast } from "sonner";
import { logger } from "@/lib/logger.client";
import { flashLogLevel, flashSeveritySchema, type FlashBreadcrumb, type FlashEvent, type FlashSeverity } from "../../shared/flash-telemetry";
export type { FlashBreadcrumb, FlashEvent } from "../../shared/flash-telemetry";

/**
 * Record explicit notice severity and toast call-site evidence so transient
 * failures remain attributable after navigation. ARIA roles do not define
 * severity. Observation and transport failures must not alter the UI.
 * Beacons are restricted to workspace URLs; other paths only log locally.
 */

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
    logger[flashLogLevel(event.severity)](`[flash] ${event.kind}: ${event.message}`);
    if (!workspaceId) return;

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/client-flash`;
    const body = JSON.stringify({ events: [event] });
    // Both transports must survive navigation; fetch handles rejected beacons.
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
  severity: FlashSeverity,
  stack?: string,
): void {
  ship({
    kind,
    severity,
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

// Recently captured notice identities, to avoid re-shipping a banner when a
// re-render replaces the node without the user seeing anything new.
const recentAlerts = new Map<string, number>();
const ALERT_DEDUPE_MS = 5_000;

function alertAppeared(node: Element): void {
  if (!node.isConnected || node.closest("[data-sonner-toaster]")) return;
  const severity = flashSeveritySchema.safeParse(node.getAttribute("data-severity"));
  if (!severity.success) return;
  const text = (node.textContent ?? "").trim().slice(0, 500);
  if (!text) return;
  const now = Date.now();
  const key = JSON.stringify([workspaceIdFromUrl(), severity.data, text]);
  const last = recentAlerts.get(key);
  if (last != null && now - last < ALERT_DEDUPE_MS) return;
  recentAlerts.set(key, now);
  if (recentAlerts.size > 50) {
    const oldest = [...recentAlerts.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) recentAlerts.delete(oldest[0]);
  }
  captureFlash("alert-banner", text, severity.data);
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
    captureFlash("toast-error", messageText(message), "error", new Error().stack);
    return originalError(message as never, options as never);
  }) as typeof toast.error;
  toast.warning = ((message: unknown, options?: unknown) => {
    captureFlash("toast-warning", messageText(message), "warning", new Error().stack);
    return originalWarning(message as never, options as never);
  }) as typeof toast.warning;

  const observer = new MutationObserver((mutations) => {
    const notices = new Set<Element>();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      const enclosing = target?.closest("[data-severity]");
      if (enclosing) notices.add(enclosing);
      for (const added of mutation.addedNodes) {
        if (!(added instanceof Element)) continue;
        if (added.matches("[data-severity]")) notices.add(added);
        added.querySelectorAll("[data-severity]").forEach(el => notices.add(el));
      }
    }
    notices.forEach(alertAppeared);
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["data-severity"],
  });
}
