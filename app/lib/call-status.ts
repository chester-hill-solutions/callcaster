import type { Database } from "@/lib/db-types";

/**
 * Provider (Twilio) call status normalization and state machine mapping
 * for polling and DB sync. Used by api.call-status-poll and the call screen.
 */

export type CallStatusEnum = Database["public"]["Enums"]["call_status"];

const VALID_CALL_STATUSES: CallStatusEnum[] = [
  "queued",
  "ringing",
  "in-progress",
  "canceled",
  "completed",
  "failed",
  "busy",
  "no-answer",
  "initiated",
];

/** Normalize provider status to the DB call_status enum (lowercase, valid enum). */
export function normalizeProviderStatus(providerStatus: string | null | undefined): CallStatusEnum | null {
  if (providerStatus == null || providerStatus === "") return null;
  const lower = String(providerStatus).toLowerCase();
  if (VALID_CALL_STATUSES.includes(lower as CallStatusEnum)) {
    return lower as CallStatusEnum;
  }
  return null;
}

/** Terminal statuses that should trigger HANG_UP or FAIL in the call state machine. */
const TERMINAL_STATUSES = new Set<CallStatusEnum>([
  "completed",
  "failed",
  "no-answer",
  "busy",
  "canceled",
]);

/** Statuses that mean "connected" for the UI state machine. */
const CONNECTED_STATUSES = new Set<CallStatusEnum>(["in-progress"]);

/** Statuses that mean "dialing" (ringing, etc.). */
const DIALING_STATUSES = new Set<CallStatusEnum>(["initiated", "queued", "ringing"]);

export type CallStateAction = "CONNECT" | "HANG_UP" | "FAIL" | null;

/**
 * Map provider status to state machine action for the call screen.
 * - CONNECT: provider says in-progress (dialing -> connected).
 * - HANG_UP: provider says completed or canceled.
 * - FAIL: provider says failed, no-answer, or busy.
 */
export function getStateMachineAction(
  normalizedStatus: CallStatusEnum | null
): CallStateAction {
  if (normalizedStatus == null) return null;
  if (CONNECTED_STATUSES.has(normalizedStatus)) return "CONNECT";
  if (normalizedStatus === "completed" || normalizedStatus === "canceled") return "HANG_UP";
  if (["failed", "no-answer", "busy"].includes(normalizedStatus)) return "FAIL";
  return null;
}

/**
 * Dialer-room display vocabulary used by the predictive call screen
 * (usePredictiveCallSync / useCampaignCallFlow's predictive mapping).
 */
const DIALER_STATUSES = new Set<string>([
  "idle",
  "dialing",
  "connected",
  "completed",
  "failed",
  "no-answer",
]);

/**
 * Map a predictive_broadcast status to the dialer display vocabulary.
 *
 * Broadcasts carry raw provider (Twilio) call statuses, while the dialer UI
 * speaks idle/dialing/connected/completed/failed/no-answer. Already-normalized
 * dialer values pass through unchanged, and so do unrecognized strings — the
 * consumers treat unknown statuses as "fall through to FSM/provider display",
 * and this keeps that behavior intact.
 */
export function toDialerStatus(status: string): string {
  if (DIALER_STATUSES.has(status)) return status;
  const normalized = normalizeProviderStatus(status);
  if (normalized == null) return status;
  if (DIALING_STATUSES.has(normalized)) return "dialing";
  if (CONNECTED_STATUSES.has(normalized)) return "connected";
  if (normalized === "completed" || normalized === "canceled") return "completed";
  if (normalized === "failed" || normalized === "busy") return "failed";
  if (normalized === "no-answer") return "no-answer";
  return status;
}

/** Whether the status is terminal (call ended); polling can stop. */
export function isTerminalStatus(normalizedStatus: CallStatusEnum | null): boolean {
  return normalizedStatus != null && TERMINAL_STATUSES.has(normalizedStatus);
}

/** Whether the status is active (initiated, queued, ringing, in-progress); polling should run. */
export function isActiveStatus(normalizedStatus: CallStatusEnum | null): boolean {
  if (normalizedStatus == null) return false;
  return (
    CONNECTED_STATUSES.has(normalizedStatus) || DIALING_STATUSES.has(normalizedStatus)
  );
}

/**
 * Call SID selection for polling (documented for call screen):
 * - Prefer the call record SID: recentCall?.sid or the call linked to recentAttempt.
 * - Fall back to the active device call: activeCall?.parameters?.CallSid.
 * Only poll when we have a valid callSid and the call is in an active state.
 */
