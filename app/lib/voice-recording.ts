import { z } from "zod";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";

export class VoiceRecordingBindingError extends Error {
  constructor(message: string) { super(message); this.name = "VoiceRecordingBindingError"; }
}

export function voiceRecordingCallbackUrl(baseUrl: string, operationId: string) {
  const url = new URL("/api/voice-recording", baseUrl);
  url.searchParams.set("recording", operationId);
  return url.href;
}

export const voiceRecordingReceiptSchema = z.strictObject({
  requestUrl: z.url(), accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i), callSid: z.string().regex(/^CA[0-9a-f]{32}$/i),
  recordingSid: z.string().regex(/^RE[0-9a-f]{32}$/i), source: z.enum(["DialVerb", "StartCallRecordingAPI"]),
  status: z.enum(["in-progress", "completed", "absent"]), startedAt: z.date().optional(),
  durationSeconds: z.int().nonnegative().max(2147483647).optional(), channels: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type VoiceRecordingReceipt = z.infer<typeof voiceRecordingReceiptSchema>;
export type VoiceRecordingObservation = Omit<VoiceRecordingReceipt, "status"> & { status?: VoiceRecordingReceipt["status"] };

const integerParam = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number).pipe(z.int().nonnegative().max(2147483647));
const callbackSchema = z.object({
  AccountSid: voiceRecordingReceiptSchema.shape.accountSid, CallSid: voiceRecordingReceiptSchema.shape.callSid,
  RecordingSid: voiceRecordingReceiptSchema.shape.recordingSid, RecordingSource: voiceRecordingReceiptSchema.shape.source,
  RecordingStatus: voiceRecordingReceiptSchema.shape.status, RecordingDuration: integerParam.optional(),
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
  return { requestUrl, accountSid: event.AccountSid, callSid: event.CallSid, recordingSid: event.RecordingSid,
    source: event.RecordingSource, status: event.RecordingStatus, durationSeconds: event.RecordingDuration,
    channels: event.RecordingChannels, startedAt: event.RecordingStartTime };
}
