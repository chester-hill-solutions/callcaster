/**
 * Non-`.server.ts` module: core setup gates for workspace onboarding.
 *
 * Core setup (always required before path-specific wizard work):
 * business profile baseline + selected campaign goal.
 * Path steps (audience, number, script, …) remain in the onboarding wizard.
 */

import {
  findMissingBusinessProfileFields,
} from "@/lib/messaging-onboarding/predicates";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

/**
 * True when the workspace finished the always-required prefix:
 * business basics + a selected goal. Path wizard steps may still be open.
 */
export function isWorkspaceIntakeComplete(
  onboarding: Pick<
    WorkspaceMessagingOnboardingState,
    "status" | "selectedGoal" | "businessProfile"
  >,
): boolean {
  if (onboarding.status === "not_started") {
    return false;
  }
  if (onboarding.selectedGoal == null) {
    return false;
  }
  return findMissingBusinessProfileFields(onboarding.businessProfile).length === 0;
}
