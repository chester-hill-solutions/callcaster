import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding.server";
import type { CallerIdValidationRequest } from "@/lib/caller-id-verification.server";
import type {
  WorkspaceMessagingBusinessProfile,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";

export type OnboardingActionData = {
  success?: string;
  warning?: string;
  error?: string;
  validationRequest?: CallerIdValidationRequest;
};

const ALL_CHANNEL_OPTIONS: Array<{
  id: WorkspaceOnboardingChannel;
  label: string;
  description: string;
}> = [
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
  {
    id: "voice_compliance",
    label: "Voice emergency compliance",
    description: "Track emergency address and emergency-capable number readiness.",
  },
];

export const CHANNEL_OPTIONS = ALL_CHANNEL_OPTIONS.filter(
  (option) => option.id !== "rcs" || isRcsOnboardingEnabled(),
);

export function asWorkspaceOnboardingStatus(
  value: FormDataEntryValue | null,
): WorkspaceOnboardingStatus {
  switch (value) {
    case "not_started":
    case "collecting_business":
    case "provisioning":
    case "submitting":
    case "in_review":
    case "approved":
    case "rejected":
    case "live":
      return value;
    default:
      return "in_review";
  }
}

export function readSelectedChannels(formData: FormData): WorkspaceOnboardingChannel[] {
  const values = formData.getAll("selectedChannels").map(String);
  return values.filter((value): value is WorkspaceOnboardingChannel =>
    CHANNEL_OPTIONS.some((option) => option.id === value),
  );
}

export function buildBusinessProfile(
  formData: FormData,
): WorkspaceMessagingBusinessProfile {
  const sampleMessages = String(formData.get("sampleMessages") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    legalBusinessName: String(formData.get("legalBusinessName") ?? ""),
    businessType: String(formData.get("businessType") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    privacyPolicyUrl: String(formData.get("privacyPolicyUrl") ?? ""),
    termsOfServiceUrl: String(formData.get("termsOfServiceUrl") ?? ""),
    supportEmail: String(formData.get("supportEmail") ?? ""),
    supportPhone: String(formData.get("supportPhone") ?? ""),
    useCaseSummary: String(formData.get("useCaseSummary") ?? ""),
    optInWorkflow: String(formData.get("optInWorkflow") ?? ""),
    optInKeywords: String(formData.get("optInKeywords") ?? ""),
    optOutKeywords: String(formData.get("optOutKeywords") ?? ""),
    helpKeywords: String(formData.get("helpKeywords") ?? ""),
    sampleMessages,
  };
}

export type OnboardingActionName =
  | "save_channels"
  | "bootstrap_messaging_service"
  | "save_business_profile"
  | "review_emergency_voice"
  | "provision_a2p"
  | "save_rcs"
  | "advance_step"
  | "skip_first_number"
  | "verify_caller_id";

export const ONBOARDING_ACTION_NAMES = new Set<OnboardingActionName>([
  "save_channels",
  "bootstrap_messaging_service",
  "save_business_profile",
  "review_emergency_voice",
  "provision_a2p",
  "save_rcs",
  "advance_step",
  "skip_first_number",
  "verify_caller_id",
]);

export function isOnboardingActionName(value: string): value is OnboardingActionName {
  return ONBOARDING_ACTION_NAMES.has(value as OnboardingActionName);
}
