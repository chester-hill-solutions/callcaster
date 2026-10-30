import { isObject } from "@/lib/type-safety-utils";
import { voiceRecordingReceiptFromParams } from "@/lib/voice-recording";
import type { VoiceRecordingOperation } from "@/server/voice-recording-operation.server";

export const VOICE_RECORDING_HISTORY_LIMIT = 1000;

/** Call Events is provider-authenticated evidence of its exact callback request. */
export function voiceRecordingSidFromHistory(owner: VoiceRecordingOperation, events: unknown[]) {
  if (events.length >= VOICE_RECORDING_HISTORY_LIMIT) return null;
  const proven = new Set<string>();
  for (const event of events) {
    if (!isObject(event) || !isObject(event.request)) continue;
    const request = event.request;
    if (request.method !== "POST" || typeof request.url !== "string" || request.url.split("#")[0] !== owner.callback_url || !isObject(request.parameters)) continue;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.parameters)) if (typeof value === "string") params[key] = value;
    const receipt = voiceRecordingReceiptFromParams(params, owner.callback_url);
    if (receipt?.accountSid === owner.account_sid && receipt.callSid === owner.source_call_sid &&
        receipt.source === (owner.kind === "dial" ? "DialVerb" : "StartCallRecordingAPI")) proven.add(receipt.recordingSid);
  }
  return proven.size === 1 ? [...proven][0] ?? null : null;
}
