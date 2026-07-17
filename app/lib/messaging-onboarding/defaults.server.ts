import type { WorkspaceOnboardingStepState } from "@/lib/types";
export {
  WIZARD_ONBOARDING_STEP_IDS,
  isWizardOnboardingStepId,
  resolvePersistedWizardStep,
  type WizardOnboardingStepId,
} from "@/lib/messaging-onboarding/wizard-steps";

export const WORKSPACE_MESSAGING_ONBOARDING_VERSION = 3;

export const DEFAULT_WORKSPACE_ONBOARDING_STEPS: WorkspaceOnboardingStepState[] = [
  {
    id: "business_profile",
    label: "Business basics",
    status: "pending",
    description: "Share the business identity and contact details used across campaigns.",
  },
  {
    id: "path_selection",
    label: "Your goal",
    status: "pending",
    description: "Choose whether you are setting up a live call session, IVR, or SMS blast.",
  },
  {
    id: "audience",
    label: "Audience",
    status: "pending",
    description: "Upload the contacts you plan to reach.",
  },
  {
    id: "first_number",
    label: "Phone number",
    status: "pending",
    description: "Rent or verify a phone number for this workspace.",
  },
  {
    id: "script",
    label: "Script",
    status: "pending",
    description: "Create the call flow or message content for your campaign.",
  },
  {
    id: "campaign_info",
    label: "Campaign info",
    status: "pending",
    description: "Name the campaign and connect audience, number, and script.",
  },
  {
    id: "credits",
    label: "Credits",
    status: "pending",
    description: "Add workspace credits for calls, texts, and number rental.",
  },
  {
    id: "launch_checks",
    label: "Ready to launch",
    status: "pending",
    description: "Review setup progress and open the workspace.",
  },
];
