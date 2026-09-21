import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";
import { ONBOARDING_GOAL_OPTIONS } from "@/lib/messaging-onboarding/goals";
import type { WorkspaceOperatingCountry } from "@/lib/types";

export const OPERATING_COUNTRY_OPTIONS: Array<{
  id: WorkspaceOperatingCountry;
  label: string;
}> = [
  { id: "CA", label: "Canada" },
  { id: "US", label: "United States" },
  { id: "BOTH", label: "Both" },
];

export const WIZARD_STEP_META: Array<{
  id: WizardOnboardingStepId;
  label: string;
  shortLabel: string;
}> = [
  { id: "path_selection", label: "Your goal", shortLabel: "Goal" },
  { id: "business_identity", label: "Business identity", shortLabel: "Identity" },
  { id: "business_program", label: "Program details", shortLabel: "Program" },
  { id: "audience", label: "Call list", shortLabel: "Call list" },
  { id: "first_number", label: "Phone number", shortLabel: "Number" },
  { id: "script", label: "Script", shortLabel: "Script" },
  { id: "campaign_info", label: "Campaign info", shortLabel: "Campaign" },
  { id: "credits", label: "Credits", shortLabel: "Credits" },
  { id: "launch_checks", label: "Review your setup", shortLabel: "Review" },
];

export const GOAL_OPTIONS = ONBOARDING_GOAL_OPTIONS;

export const TWILIO_RCS_PROVIDER = "Twilio";
export const TWILIO_RCS_DOCS_URL = "https://www.twilio.com/docs/rcs/onboarding";
export const TWILIO_RCS_SENDERS_URL = "https://console.twilio.com/us1/develop/rcs/senders";
