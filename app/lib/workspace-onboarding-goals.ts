/**
 * Product goals chosen during workspace onboarding.
 * Shared by client UI and server (non-`.server.ts`).
 */

export const WORKSPACE_ONBOARDING_GOAL_VALUES = [
  "live_call",
  "ivr",
  "sms_blast",
  "rent_number",
] as const;

export type WorkspaceOnboardingGoal =
  (typeof WORKSPACE_ONBOARDING_GOAL_VALUES)[number];
