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
