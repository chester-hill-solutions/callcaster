/**
 * Non-`.server.ts` module: goal identifiers and channel mapping shared by
 * client UI and server actions.
 */

import {
  WORKSPACE_ONBOARDING_GOAL_VALUES,
  type WorkspaceOnboardingGoal,
} from "@/lib/workspace-onboarding-goals";
import type { WorkspaceOnboardingChannel, WorkspaceOperatingCountry } from "@/lib/types";
import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";

export { WORKSPACE_ONBOARDING_GOAL_VALUES };

export function isWorkspaceOnboardingGoal(
  value: string,
): value is WorkspaceOnboardingGoal {
  return (WORKSPACE_ONBOARDING_GOAL_VALUES as readonly string[]).includes(value);
}

export const ONBOARDING_GOAL_OPTIONS: Array<{
  id: WorkspaceOnboardingGoal;
  label: string;
  description: string;
}> = [
  {
    id: "live_call",
    label: "Live call session",
    description: "Connect agents with contacts in a live calling session.",
  },
  {
    id: "ivr",
    label: "IVR",
    description: "Build an automated call flow that plays prompts and collects responses.",
  },
  {
    id: "sms_blast",
    label: "SMS blast",
    description: "Send a text outreach campaign to an uploaded audience.",
  },
  {
    id: "rent_number",
    label: "Just rent a number",
    description: "Get a workspace phone number first. Add campaigns later.",
  },
];

/**
 * Map a product goal to the Twilio/compliance channel flags the existing
 * backend still understands.
 */
export function channelsForOnboardingGoal(
  goal: WorkspaceOnboardingGoal,
  operatingCountry: WorkspaceOperatingCountry,
): WorkspaceOnboardingChannel[] {
  switch (goal) {
    case "live_call":
      return ["local_number", "voice_compliance"];
    case "ivr":
      return ["local_number"];
    case "rent_number":
      return ["local_number"];
    case "sms_blast": {
      if (operatingCountry === "US") return ["a2p10dlc"];
      if (operatingCountry === "BOTH") return ["toll_free_bulk_sms", "a2p10dlc"];
      return ["toll_free_bulk_sms"];
    }
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}

/** Wizard steps after business basics + goal, ordered for the selected goal. */
export function checklistStepsForGoal(
  goal: WorkspaceOnboardingGoal | null,
): WizardOnboardingStepId[] {
  if (goal === "rent_number") {
    return ["first_number", "credits", "launch_checks"];
  }
  const shared: WizardOnboardingStepId[] = ["audience", "first_number"];
  if (goal === "live_call") {
    return [...shared, "campaign_info", "credits", "launch_checks"];
  }
  // IVR, SMS blast, or goal not yet chosen: include script setup.
  return [...shared, "script", "campaign_info", "credits", "launch_checks"];
}

/**
 * Goal first (#1104), then minimal identity, then program only when SMS
 * compliance needs it (#1105/#1106), then the goal checklist.
 */
export function wizardStepsForGoal(
  goal: WorkspaceOnboardingGoal | null,
): WizardOnboardingStepId[] {
  const afterGoal: WizardOnboardingStepId[] = ["business_identity"];
  if (goalNeedsSmsCompliance(goal)) {
    afterGoal.push("business_program");
  }
  return ["path_selection", ...afterGoal, ...checklistStepsForGoal(goal)];
}

export function nextWizardStep(
  current: WizardOnboardingStepId,
  goal: WorkspaceOnboardingGoal | null,
): WizardOnboardingStepId | null {
  const steps = wizardStepsForGoal(goal);
  const index = steps.indexOf(current);
  if (index < 0 || index >= steps.length - 1) return null;
  return steps[index + 1]!;
}

export function previousWizardStep(
  current: WizardOnboardingStepId,
  goal: WorkspaceOnboardingGoal | null,
): WizardOnboardingStepId | null {
  const steps = wizardStepsForGoal(goal);
  const index = steps.indexOf(current);
  if (index <= 0) return null;
  return steps[index - 1]!;
}

/** Whether the goal checklist includes a given post-goal step. */
export function goalIncludesChecklistStep(
  goal: WorkspaceOnboardingGoal | null,
  stepId: WizardOnboardingStepId,
): boolean {
  return checklistStepsForGoal(goal).includes(stepId);
}

export function goalNeedsScript(goal: WorkspaceOnboardingGoal | null): boolean {
  return goalIncludesChecklistStep(goal, "script");
}

export function goalNeedsSmsCompliance(goal: WorkspaceOnboardingGoal | null): boolean {
  return goal === "sms_blast";
}
