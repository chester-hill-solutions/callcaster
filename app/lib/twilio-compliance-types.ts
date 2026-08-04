/**
 * Shared types for the Twilio "Canada-first" compliance provisioning steps
 * (toll-free verification and A2P 10DLC registration).
 *
 * These live in a small standalone module — NOT in `app/lib/types.ts` — so the
 * compliance orchestrator (Phase B) and the provision modules fleshed out by
 * Phases C (toll-free) and D (A2P) can share a stable contract without churning
 * the large onboarding-state type file.
 */

/**
 * Local, step-scoped status vocabulary for a single compliance provisioning
 * step. This is intentionally distinct from `WorkspaceOnboardingStatus`: the
 * orchestrator maps these onto the existing onboarding-state enums when it
 * persists (e.g. `action_needed` -> `rejected` + `blockingIssues`).
 */
export type ComplianceStepStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "action_needed";

/**
 * Input passed to every compliance provisioning step. Kept deliberately small
 * and stable — Phases C and D read from onboarding state via `workspaceId`
 * rather than expanding this shape.
 */
export type ComplianceStepArgs = {
  workspaceId: string;
  /** Actor that triggered the run (job enqueue reason surfaces here as null). */
  actorUserId: string | null;
  /** Trust Hub Secondary Customer Profile bundle SID created upstream. */
  customerProfileBundleSid: string;
  /** Free-text reason the compliance job was enqueued (for logging/audit). */
  reason?: string;
};

/**
 * Result returned by every compliance provisioning step. The orchestrator uses
 * `status` + `blockingIssues` to drive onboarding-state persistence and the
 * ops-alert email.
 */
export type ComplianceStepResult = {
  status: ComplianceStepStatus;
  /** Customer-facing "action needed" issues; empty when nothing blocks. */
  blockingIssues: string[];
  /** Optional provider-specific detail (SIDs, raw statuses) for audit/admin. */
  details?: Record<string, unknown>;
};

/** True when a step result is a terminal failure the orchestrator must halt on. */
export function isTerminalComplianceFailure(
  result: ComplianceStepResult,
): boolean {
  return result.status === "rejected" || result.status === "action_needed";
}
