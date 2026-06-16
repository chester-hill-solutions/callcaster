import type { WorkspaceOnboardingStepState } from "@/lib/types";

export const WORKSPACE_MESSAGING_ONBOARDING_VERSION = 2;

/** Steps shown in the guided onboarding wizard (single screen each). */
export const WIZARD_ONBOARDING_STEP_IDS = [
  "business_profile",
  "path_selection",
  "messaging_service",
  "first_number",
  "provider_provisioning",
  "launch_checks",
] as const;

export type WizardOnboardingStepId = (typeof WIZARD_ONBOARDING_STEP_IDS)[number];

export function isWizardOnboardingStepId(value: string): value is WizardOnboardingStepId {
  return (WIZARD_ONBOARDING_STEP_IDS as readonly string[]).includes(value);
}

export const DEFAULT_WORKSPACE_ONBOARDING_STEPS: WorkspaceOnboardingStepState[] = [
  {
    id: "business_profile",
    label: "Business basics",
    status: "pending",
    description: "Start with the legal business identity, website, and support contact details.",
  },
  {
    id: "use_case",
    label: "Messaging use case",
    status: "pending",
    description: "Explain what you send, how people opt in, and include sample messages.",
  },
  {
    id: "path_selection",
    label: "Channel selection",
    status: "pending",
    description: "Choose which messaging and voice tracks this workspace actually needs.",
  },
  {
    id: "messaging_service",
    label: "Messaging Service",
    status: "pending",
    description: "Provision or confirm the shared Messaging Service used for sending.",
  },
  {
    id: "first_number",
    label: "Your first number",
    status: "pending",
    description: "Rent a Canadian number to send and receive calls and texts.",
  },
  {
    id: "provider_provisioning",
    label: "Provider provisioning",
    status: "pending",
    description: "Create provider resources and track carrier or provider review.",
  },
  {
    id: "launch_checks",
    label: "Launch checks",
    status: "pending",
    description: "Confirm sender attachment, readiness, and compatibility.",
  },
];
