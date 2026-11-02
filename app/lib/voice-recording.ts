import { z } from "zod";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";

export class VoiceRecordingBindingError extends Error {
  constructor(message: string) { super(message); this.name = "VoiceRecordingBindingError"; }
}

export type VoiceCustomerRecordingIntent = { id: string; callbackUrl: string };

export function voiceRecordingSource(kind: "dial" | "parent" | "customer" | "conference") {
  if (kind === "dial") return "DialVerb";
  if (kind === "conference") return "Conference";
  return kind === "customer" ? "OutboundAPI" : "StartCallRecordingAPI";
}

export function voiceRecordingCallbackUrl(baseUrl: string, operationId: string) {
  const url = new URL("/api/voice-recording", baseUrl);
  url.searchParams.set("recording", operationId);
  return url.href;
}

const receiptFields = z.strictObject({
  requestUrl: z.url(), accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i), callSid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
  conferenceSid: z.string().regex(/^CF[0-9a-f]{32}$/i).optional(),
  recordingSid: z.string().regex(/^RE[0-9a-f]{32}$/i), source: z.enum(["DialVerb", "StartCallRecordingAPI", "OutboundAPI", "Conference"]),
  status: z.enum(["in-progress", "completed", "absent"]), startedAt: z.date().optional(),
  durationSeconds: z.int().nonnegative().max(2147483647).optional(), channels: z.union([z.literal(1), z.literal(2)]).optional(),
});
function hasRecordingSource(value: { source: string; callSid?: string; conferenceSid?: string }) {
  return value.source === "Conference" ? Boolean(value.conferenceSid && !value.callSid) : Boolean(value.callSid && !value.conferenceSid);
}
export const voiceRecordingReceiptSchema = receiptFields.refine(hasRecordingSource, "Recording physical source is invalid");
export const voiceRecordingObservationSchema = receiptFields.partial({ status: true }).refine(hasRecordingSource, "Recording physical source is invalid");
export type VoiceRecordingReceipt = z.infer<typeof voiceRecordingReceiptSchema>;
export type VoiceRecordingObservation = Omit<VoiceRecordingReceipt, "status"> & { status?: VoiceRecordingReceipt["status"] };

const integerParam = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number).pipe(z.int().nonnegative().max(2147483647));
const callbackSchema = z.object({
  AccountSid: receiptFields.shape.accountSid, CallSid: receiptFields.shape.callSid, ConferenceSid: receiptFields.shape.conferenceSid,
  RecordingSid: receiptFields.shape.recordingSid, RecordingSource: receiptFields.shape.source,
  RecordingStatus: receiptFields.shape.status, RecordingDuration: integerParam.optional(),
  RecordingChannels: integerParam.pipe(z.union([z.literal(1), z.literal(2)])).optional(),
  RecordingStartTime: z.string().min(1).transform((value) => new Date(value)).pipe(z.date()).optional(),
});

/** Authenticate the original form first. Aliases must agree before normalization. */
export function voiceRecordingReceiptFromParams(params: Record<string, string>, requestUrl: string) {
  if (!normalizeVerifiedVoiceParams(params, [
    ["RecordingSid", "recording_sid"], ["RecordingSource", "recording_source"], ["RecordingStatus", "recording_status"],
    ["RecordingDuration", "recording_duration"], ["RecordingChannels", "recording_channels"], ["RecordingStartTime", "recording_start_time"],
  ])) return null;
  const parsed = callbackSchema.safeParse(params);
  if (!parsed.success) return null;
  const event = parsed.data;
  const receipt = voiceRecordingReceiptSchema.safeParse({ requestUrl, accountSid: event.AccountSid,
    callSid: event.CallSid, conferenceSid: event.ConferenceSid, recordingSid: event.RecordingSid,
    source: event.RecordingSource, status: event.RecordingStatus, durationSeconds: event.RecordingDuration,
    channels: event.RecordingChannels, startedAt: event.RecordingStartTime });
  return receipt.success ? receipt.data : null;
}
