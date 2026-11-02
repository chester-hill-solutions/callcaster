import { randomUUID } from "node:crypto";
import { accountSid, callerId, customer, sid, signedAudio, web, workspaceId } from "./voice-audio-fixture";
import { customerAttempt, customerPhaseLabel, customerUrls, fundCustomerAttempt, signedCustomerRecording, signedPhoneCustomerVoice } from "./voice-audio-customer-fixture";
import { recordVoiceReservationProvider, startVoiceReservation } from "@/server/voice-credit-reservation.server";
import { findVoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { finishVoiceRecordingCopy } from "@/server/voice-recording-copy.server";
import { enqueueFundedVoiceTerminalOutcome } from "@/server/voice-terminal-outcome.server";
import { recordVoiceCustomerCallTiming } from "@/server/voice-customer-media-boundary.server";
import { readVoiceCallRecordingManifest } from "@/server/voice-recording-batch.server";

export const PHASE_CALL_START = new Date("2026-11-01T14:00:00Z");
export const PHASE_CALL_END = new Date("2026-11-01T14:00:42Z");

export async function phaseCall(grant = true) {
  const source = await customerAttempt(), funded = await fundCustomerAttempt(source.args), urls = customerUrls(funded.id);
  const started = await startVoiceReservation(funded, urls, source.args.audioSource?.proof), customerSid = sid();
  const remote = { ...source.call, sid: customerSid, to: customer, from: callerId, voiceUrl: urls.voiceUrl,
    statusCallback: urls.statusCallback, startTime: PHASE_CALL_START, endTime: null };
  web.records.set(customerSid, remote);
  const owner = await recordVoiceReservationProvider(started, customerSid);
  const recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
  const f = { ...source, urls, owner, customerSid, recordingSid, remote,
    audioUrl: `call-recordings/${workspaceId}/recording-${customerSid}-${recordingSid}.mp3` };
  if (grant && !(await (await signedPhoneCustomerVoice(urls.voiceUrl, customerSid)).text()).includes("<Conference"))
    throw new Error("The phase fixture requires a real granted customer instruction");
  return f;
}

export type PhaseFixture = Awaited<ReturnType<typeof phaseCall>>;

export function phaseVoice(f: PhaseFixture) { return signedPhoneCustomerVoice(f.urls.voiceUrl, f.customerSid); }

export async function phaseVisit(f: PhaseFixture, event: "participant-join" | "participant-leave", patch: Record<string, string> = {}, valid = true) {
  return signedAudio(f.row.conference_callback, { AccountSid: accountSid, CallSid: f.customerSid,
    ConferenceSid: f.row.conference_sid ?? "", FriendlyName: f.row.conference_id, ParticipantLabel: await customerPhaseLabel(f.owner.id),
    StatusCallbackEvent: event, SequenceNumber: event === "participant-join" ? "0" : "99",
    Timestamp: event === "participant-join" ? "Sun, 1 Nov 2026 14:00:01 +0000" : "Sun, 1 Nov 2026 14:00:41 +0000",
    Muted: "false", Hold: "false", ...(event === "participant-leave" ? { ReasonParticipantLeft: "participant_hung_up" } : {}), ...patch }, valid);
}

export async function phaseCapture(f: PhaseFixture) {
  const response = await signedCustomerRecording(f.urls.customerRecording.callbackUrl, { AccountSid: accountSid, CallSid: f.customerSid,
    RecordingSid: f.recordingSid, RecordingSource: "OutboundAPI", RecordingStatus: "completed", RecordingChannels: "2",
    RecordingStartTime: PHASE_CALL_START.toUTCString(), RecordingDuration: "42" });
  if (response.status !== 204) throw new Error("The phase fixture requires an accepted capture receipt");
  const part = await findVoiceRecordingOperation(f.urls.customerRecording.id);
  if (!part || !await finishVoiceRecordingCopy(part, f.audioUrl)) throw new Error("The phase fixture requires copied-media acknowledgement");
  return part;
}

export async function phaseTerminal(f: PhaseFixture, actual = true) {
  await enqueueFundedVoiceTerminalOutcome(workspaceId, f.customerSid, { AccountSid: accountSid, CallSid: f.customerSid,
    To: customer, From: callerId, Direction: "outbound-api", CallStatus: "completed", CallDuration: "42",
    CallbackSource: "call-progress-events", Timestamp: PHASE_CALL_END.toUTCString(), SequenceNumber: "3" });
  Object.assign(f.remote, { status: "completed", duration: "42", startTime: PHASE_CALL_START, endTime: PHASE_CALL_END });
  if (actual) await recordVoiceCustomerCallTiming(f.owner, { sid: f.customerSid, accountSid, to: customer, from: callerId,
    direction: "outbound-api", parentCallSid: null, status: "completed", duration: "42", startTime: PHASE_CALL_START, endTime: PHASE_CALL_END });
}

export function phaseManifest(f: PhaseFixture) { return readVoiceCallRecordingManifest(workspaceId, f.customerSid, f.audioUrl); }
