import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";
import { ONBOARDING_GOAL_OPTIONS } from "@/lib/messaging-onboarding/goals";
import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding-flags";
import type {
  WorkspaceOnboardingChannel,
  WorkspaceOperatingCountry,
} from "@/lib/types";

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
  { id: "launch_checks", label: "Ready to launch", shortLabel: "Launch" },
];

export const GOAL_OPTIONS = ONBOARDING_GOAL_OPTIONS;

export const TWILIO_RCS_PROVIDER = "Twilio";
export const TWILIO_RCS_DOCS_URL = "https://www.twilio.com/docs/rcs/onboarding";
export const TWILIO_RCS_SENDERS_URL = "https://console.twilio.com/us1/develop/rcs/senders";

const ALL_CHANNEL_OPTIONS: Array<{
  id: WorkspaceOnboardingChannel;
  label: string;
  description: string;
}> = [
  {
    id: "local_number",
    label: "Local Number",
    description:
      "Canadian local number for inbound SMS and calls; rent one in the next step.",
  },
  {
    id: "toll_free_bulk_sms",
    label: "Toll-free bulk SMS",
    description:
      "High-volume SMS to Canadian mobiles; requires a toll-free number + verification.",
  },
  {
    id: "a2p10dlc",
    label: "A2P 10DLC",
    description: "Register US application-to-person SMS campaigns and sender trust.",
  },
  {
    id: "rcs",
    label: "RCS for business",
    description: "Track rich-messaging readiness while the provider path matures.",
  },
];

/** Retained for API/admin surfaces that still present channel options. */
export const CHANNEL_OPTIONS = ALL_CHANNEL_OPTIONS.filter(
  (option) => option.id !== "rcs" || isRcsOnboardingEnabled(),
);
