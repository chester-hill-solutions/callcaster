import { z } from "zod";
import type { TwilioMessageIntent } from "@/lib/types";
import {
  TWILIO_MESSAGE_INTENT_VALUES,
  TWILIO_MULTI_TENANCY_MODE_VALUES,
  TWILIO_SMS_SENDER_CLASS_VALUES,
  TWILIO_THROUGHPUT_PRODUCT_VALUES,
  TWILIO_TRAFFIC_CLASS_VALUES,
} from "@/lib/types";

const positiveNumber = z.coerce.number().finite().positive();

function parseMessageIntent(value: unknown): TwilioMessageIntent | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return TWILIO_MESSAGE_INTENT_VALUES.includes(raw as TwilioMessageIntent)
    ? (raw as TwilioMessageIntent)
    : null;
}

/** Ops-only portal fields; provisioning is driven by onboarding. */
export const twilioPortalOpsConfigFormSchema = z.object({
  trafficClass: z.enum(TWILIO_TRAFFIC_CLASS_VALUES),
  throughputProduct: z.enum(TWILIO_THROUGHPUT_PRODUCT_VALUES),
  multiTenancyMode: z.enum(TWILIO_MULTI_TENANCY_MODE_VALUES),
  trafficShapingEnabled: z.boolean(),
  defaultMessageIntent: z.enum(TWILIO_MESSAGE_INTENT_VALUES).nullable(),
  supportNotes: z.string(),
  smsSenderClass: z.enum(TWILIO_SMS_SENDER_CLASS_VALUES),
  smsTargetMps: positiveNumber,
  voiceTargetCps: positiveNumber,
  voiceConcurrentCallLimit: z.coerce.number().finite().int().positive(),
  parallelDispatchEnabled: z.boolean(),
});

export type TwilioPortalOpsConfigFormValues = z.infer<
  typeof twilioPortalOpsConfigFormSchema
>;

export function parseTwilioPortalConfigForm(
  formData: FormData,
): TwilioPortalOpsConfigFormValues {
  return twilioPortalOpsConfigFormSchema.parse({
    trafficClass: String(formData.get("trafficClass") ?? "unknown"),
    throughputProduct: String(formData.get("throughputProduct") ?? "none"),
    multiTenancyMode: String(formData.get("multiTenancyMode") ?? "none"),
    trafficShapingEnabled: formData.get("trafficShapingEnabled") === "on",
    defaultMessageIntent: parseMessageIntent(formData.get("defaultMessageIntent")),
    supportNotes: String(formData.get("supportNotes") ?? ""),
    smsSenderClass: String(formData.get("smsSenderClass") ?? "unknown"),
    smsTargetMps: formData.get("smsTargetMps"),
    voiceTargetCps: formData.get("voiceTargetCps"),
    voiceConcurrentCallLimit: formData.get("voiceConcurrentCallLimit"),
    parallelDispatchEnabled: formData.get("parallelDispatchEnabled") === "on",
  });
}

const workspaceOnboardingStatusSchema = z.enum([
  "not_started",
  "collecting_business",
  "provisioning",
  "submitting",
  "in_review",
  "approved",
  "rejected",
  "live",
]);

export const twilioRcsOnboardingFormSchema = z.object({
  displayName: z.string(),
  publicDescription: z.string(),
  logoImageUrl: z.string(),
  bannerImageUrl: z.string(),
  accentColor: z.string(),
  optInPolicyImageUrl: z.string(),
  useCaseVideoUrl: z.string(),
  representativeName: z.string(),
  representativeTitle: z.string(),
  representativeEmail: z.string(),
  notificationEmail: z.string(),
  agentId: z.string().nullable(),
  senderId: z.string().nullable(),
  regions: z.array(z.string()),
  notes: z.string(),
  status: workspaceOnboardingStatusSchema,
});

export type TwilioRcsOnboardingFormValues = z.infer<typeof twilioRcsOnboardingFormSchema>;

export function parseTwilioRcsOnboardingForm(formData: FormData): TwilioRcsOnboardingFormValues {
  const agentId = String(formData.get("rcsAgentId") ?? "").trim();
  const senderId = String(formData.get("rcsSenderId") ?? "").trim();
  const statusRaw = String(formData.get("rcsStatus") ?? "in_review");
  const status = workspaceOnboardingStatusSchema.safeParse(statusRaw);

  return twilioRcsOnboardingFormSchema.parse({
    displayName: String(formData.get("rcsDisplayName") ?? ""),
    publicDescription: String(formData.get("rcsPublicDescription") ?? ""),
    logoImageUrl: String(formData.get("rcsLogoImageUrl") ?? ""),
    bannerImageUrl: String(formData.get("rcsBannerImageUrl") ?? ""),
    accentColor: String(formData.get("rcsAccentColor") ?? ""),
    optInPolicyImageUrl: String(formData.get("rcsOptInPolicyImageUrl") ?? ""),
    useCaseVideoUrl: String(formData.get("rcsUseCaseVideoUrl") ?? ""),
    representativeName: String(formData.get("rcsRepresentativeName") ?? ""),
    representativeTitle: String(formData.get("rcsRepresentativeTitle") ?? ""),
    representativeEmail: String(formData.get("rcsRepresentativeEmail") ?? ""),
    notificationEmail: String(formData.get("rcsNotificationEmail") ?? ""),
    agentId: agentId || null,
    senderId: senderId || null,
    regions: String(formData.get("rcsRegions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notes: String(formData.get("rcsNotes") ?? ""),
    status: status.success ? status.data : "in_review",
  });
}
