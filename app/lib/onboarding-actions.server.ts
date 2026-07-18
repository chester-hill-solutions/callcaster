import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding.server";
import type { CallerIdValidationRequest } from "@/lib/caller-id-verification.server";
import { isWorkspaceOnboardingGoal } from "@/lib/messaging-onboarding/goals";
import type {
  WorkspaceMessagingBusinessProfile,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingGoal,
  WorkspaceOnboardingStatus,
} from "@/lib/types";
import { WORKSPACE_ONBOARDING_CHANNEL_VALUES } from "@/lib/types";

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
    WORKSPACE_ONBOARDING_CHANNEL_VALUES.includes(value as WorkspaceOnboardingChannel),
  );
}

export function readSelectedGoal(formData: FormData): WorkspaceOnboardingGoal | null {
  const raw = String(formData.get("selectedGoal") ?? formData.get("selected_goal") ?? "");
  return isWorkspaceOnboardingGoal(raw) ? raw : null;
}

const EMPTY_BUSINESS_PROFILE: WorkspaceMessagingBusinessProfile = {
  legalBusinessName: "",
  businessType: "",
  websiteUrl: "",
  privacyPolicyUrl: "",
  termsOfServiceUrl: "",
  supportEmail: "",
  supportPhone: "",
  useCaseSummary: "",
  optInWorkflow: "",
  optInKeywords: "",
  optOutKeywords: "",
  helpKeywords: "",
  sampleMessages: [],
  doingBusinessAs: "",
  businessRegistrationNumber: "",
  ageGatedContent: false,
  ein: "",
  industry: "",
  authorizedRepName: "",
  authorizedRepEmail: "",
  authorizedRepPhone: "",
  authorizedRepTitle: "",
};

function parseSampleMessages(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Builds the business-profile payload from the Business basics form. The
 * channel-scoped inline fields (TFV / A2P Trust Hub inputs) are collected on the
 * Channels step, so they are carried over from `current` unless the current form
 * explicitly provides them.
 */
export function buildBusinessProfile(
  formData: FormData,
  current: WorkspaceMessagingBusinessProfile = EMPTY_BUSINESS_PROFILE,
): WorkspaceMessagingBusinessProfile {
  const base: WorkspaceMessagingBusinessProfile = {
    ...current,
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
    sampleMessages: parseSampleMessages(formData.get("sampleMessages")),
  };
  // Overlay channel-inline fields (TFV / A2P) onto the freshly-built base, only
  // for fields actually posted on this form.
  return readChannelInlineBusinessFields(formData, base);
}

/**
 * Overlays the channel-scoped inline business-profile fields (revealed on the
 * Channels step for `toll_free_bulk_sms` and `a2p10dlc`) onto the current
 * business profile. Only fields actually posted are overwritten, so unchecking a
 * channel or saving from another step never wipes previously-saved values.
 */
export function readChannelInlineBusinessFields(
  formData: FormData,
  current: WorkspaceMessagingBusinessProfile,
): WorkspaceMessagingBusinessProfile {
  const next: WorkspaceMessagingBusinessProfile = { ...current };
  const stringFields: Array<keyof WorkspaceMessagingBusinessProfile> = [
    "doingBusinessAs",
    "businessRegistrationNumber",
    "ein",
    "industry",
    "authorizedRepName",
    "authorizedRepEmail",
    "authorizedRepPhone",
    "authorizedRepTitle",
  ];
  for (const field of stringFields) {
    if (formData.has(field)) {
      (next[field] as string) = String(formData.get(field) ?? "");
    }
  }
  if (formData.has("ageGatedContent")) {
    const values = formData.getAll("ageGatedContent").map(String);
    const last = values[values.length - 1];
    next.ageGatedContent = last === "true" || last === "on" || last === "1";
  }
  // The Channels step reuses the shared `sampleMessages` field for TFV samples.
  if (formData.has("channelSampleMessages")) {
    next.sampleMessages = parseSampleMessages(formData.get("channelSampleMessages"));
  }
  return next;
}

export type OnboardingActionName =
  | "save_workspace_name"
  | "save_channels"
  | "bootstrap_messaging_service"
  | "save_business_profile"
  | "review_emergency_voice"
  | "provision_a2p"
  | "save_rcs"
  | "attach_rcs_sender"
  | "advance_step"
  | "skip_first_number"
  | "verify_caller_id";

export const ONBOARDING_ACTION_NAMES = new Set<OnboardingActionName>([
  "save_workspace_name",
  "save_channels",
  "bootstrap_messaging_service",
  "save_business_profile",
  "review_emergency_voice",
  "provision_a2p",
  "save_rcs",
  "attach_rcs_sender",
  "advance_step",
  "skip_first_number",
  "verify_caller_id",
]);

export function isOnboardingActionName(value: string): value is OnboardingActionName {
  return ONBOARDING_ACTION_NAMES.has(value as OnboardingActionName);
}
