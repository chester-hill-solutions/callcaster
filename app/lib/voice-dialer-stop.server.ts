import type Twilio from "twilio";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { reconcileVoiceReservation } from "@/lib/voice-credit-recovery.server";
import { reconcileAudio } from "@/lib/voice-audio-recovery.server";
import { stopVoiceAudioConferenceForParticipant } from "@/lib/voice-audio-stop.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { voiceCallLegIdentity } from "@/lib/voice-bridge-identity";
import { logger } from "@/lib/logger.server";
import { claimDialerStop, dialerStopSnapshot, finishDialerStop, listPendingDialerStops, requestDialerStop } from "@/server/voice-dialer-stop.server";
import { isDialerCallClosed, readDialerAudioResource, readDialerStopAudio, readDialerStopCalls, readDialerStopResources,
  recordDialerStoppedCall, requireOwnedDialerStop } from "@/server/voice-dialer-stop-resources.server";
import type { DialerIntentOwner, VoiceDialerIntent } from "@/server/voice-dialer-intent.server";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { observeVoiceBridgeSetupStatus } from "@/server/voice-bridge-reservation.server";

type StopContext = { owner: VoiceDialerIntent; client: Twilio.Twilio; requireCurrent: () => Promise<void> };
const terminal = (status: string | null) => isTerminalStatus(normalizeProviderStatus(status));
async function cleanupStep(context: StopContext, resource: string, action: () => Promise<boolean | void>) {
  try { await context.requireCurrent(); return await action() !== false; }
  catch (error) { logger.error("voice_dialer.stop_resource_pending", { workspaceId: context.owner.workspace, intentId: context.owner.intent_id, resource, error }); return false; }
}

function unknownVoiceSend(row: VoiceReservation) {
  if (row.state === "released") return false;
  return Boolean(row.send_started_at && (row.setup_to ? !row.setup_sid || row.recipient_instruction_issued_at && !row.provider_sid : !row.provider_sid));
}
async function stopCall(context: StopContext, row: VoiceReservation, purpose: "setup" | "recipient", sid: string) {
  await context.requireCurrent();
  if (await isDialerCallClosed(context.owner, sid)) return true;
  const remote = await context.client.calls(sid).fetch(), expected = voiceCallLegIdentity(row, purpose);
  const matches = (call: typeof remote) => call.sid === sid && call.accountSid === row.account_sid && call.to === expected.to &&
    call.from === expected.from && call.direction === expected.direction && (call.parentCallSid || null) === expected.parent_call_sid;
  if (!matches(remote)) throw new Error("Dialer Stop provider call does not match its saved owner");
  let stopped = remote;
  if (!terminal(remote.status)) {
    await context.requireCurrent();
    stopped = await context.client.calls(sid).update({ status: ["queued", "ringing", "initiated"].includes(remote.status) ? "canceled" : "completed" });
  }
  if (!matches(stopped)) throw new Error("Dialer Stop receipt names another call");
  if (!terminal(stopped.status)) return false;
  await context.requireCurrent();
  await recordDialerStoppedCall(context.owner, row, purpose, stopped);
  if (purpose === "setup") await observeVoiceBridgeSetupStatus(row, stopped);
  return true;
}
async function stopKnownCalls(context: StopContext, rows: VoiceReservation[]) {
  let closed = true;
  for (const row of rows) {
    if (row.setup_sid) closed = await cleanupStep(context, row.setup_sid, () => stopCall(context, row, "setup", row.setup_sid ?? "")) && closed;
    if (row.provider_sid) closed = await cleanupStep(context, row.provider_sid, () => stopCall(context, row, "recipient", row.provider_sid ?? "")) && closed;
  }
  return closed;
}
async function stopRoom(context: StopContext, rows: VoiceReservation[], audio: VoiceAudioConnection[]) {
  const ids = [...new Set([...rows.map(row => row.conference_sid), ...audio.map(row => row.conference_sid)].filter((id): id is string => Boolean(id)))];
  if (ids.length > 1) throw new Error("Dialer Stop has conflicting physical room identities");
  await context.requireCurrent();
  const rooms = ids[0] ? [await context.client.conferences(ids[0]).fetch()]
    : await context.client.conferences.list({ friendlyName: context.owner.conference_id ?? "", status: "in-progress", limit: 20 });
  if (rooms.length > 1) throw new Error("Dialer Stop has more than one original room");
  for (const room of rooms) {
    if (!/^CF[0-9a-f]{32}$/i.test(room.sid) || room.accountSid !== context.owner.account_sid || room.friendlyName !== context.owner.conference_id ||
      ids[0] && room.sid !== ids[0]) throw new Error("Dialer Stop room does not match its original account and name");
    if (room.status === "completed") continue;
    await context.requireCurrent();
    const stopped = await context.client.conferences(room.sid).update({ status: "completed" });
    if (stopped.sid !== room.sid || stopped.accountSid !== room.accountSid || stopped.friendlyName !== room.friendlyName || stopped.status !== "completed")
      throw new Error("Dialer Stop room receipt is not confirmed");
  }
}
async function stopAudio(context: StopContext, rows: VoiceAudioConnection[]) {
  let closed = true;
  for (const row of rows) closed = await cleanupStep(context, row.id, async () => {
    await context.requireCurrent();
    if (row.provider_sid && row.committed_at && !row.retired_at && row.conference_sid)
      await stopVoiceAudioConferenceForParticipant(row, row.provider_sid);
    const current = await readDialerAudioResource(context.owner, row.id);
    if (!current) throw new Error("Dialer Stop audio owner disappeared");
    if (current.terminal_at || !current.send_started_at && current.state === "canceled") return true;
    await context.requireCurrent();
    return await reconcileAudio(current) !== "pending";
  }) && closed;
  return closed;
}
async function cleanStoppedDialer(owner: VoiceDialerIntent) {
  const resources = await readDialerStopResources(owner);
  if (!resources.intent.account_sid) throw new Error("Dialer Stop has no original account");
  const context: StopContext = { owner, client: await createOriginalVoiceAccountClient({ workspace: owner.workspace, account_sid: resources.intent.account_sid }),
    requireCurrent: () => requireOwnedDialerStop(owner) };
  let recovered = true;
  for (const row of resources.reservations) if (unknownVoiceSend(row))
    recovered = await cleanupStep(context, row.id, async () => { await reconcileVoiceReservation(row); }) && recovered;
  const calls = await readDialerStopCalls(owner), audio = await readDialerStopAudio(owner);
  const callsClosed = await stopKnownCalls(context, calls);
  const roomClosed = await cleanupStep(context, "conference", () => stopRoom(context, [resources.original, ...calls], audio));
  const audioClosed = await cleanupStep(context, "audio", () => stopAudio(context, audio));
  const final = await readDialerStopCalls(owner);
  if (!recovered || !callsClosed || !roomClosed || !audioClosed || final.length) throw new Error("Dialer Stop is waiting for owned provider cleanup");
}

/** A recovery lease permits cleanup of only this immutable Start request. */
export async function attemptDialerStop(owner: DialerIntentOwner) {
  const claimed = await claimDialerStop(owner);
  if (!claimed) return null;
  try {
    await cleanStoppedDialer(claimed);
    return await finishDialerStop(claimed, null);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Dialer Stop cleanup is pending";
    logger.error("voice_dialer.stop_pending", { workspaceId: claimed.workspace, intentId: claimed.intent_id, error });
    return await finishDialerStop(claimed, message);
  }
}
export async function stopCapturedDialer(owner: DialerIntentOwner, conferenceName?: string) {
  const requested = await requestDialerStop(owner, conferenceName);
  if (!requested.ok) return requested;
  const saved = requested.intent.stopped_at ? requested.intent : await attemptDialerStop(owner) ?? requested.intent;
  return { ok: true as const, snapshot: dialerStopSnapshot(saved) };
}
export async function runDialerStopRecovery() {
  const rows = await listPendingDialerStops(), counts = { examined: rows.length, stopped: 0, pending: 0 };
  for (const row of rows) {
    try {
      const result = await attemptDialerStop({ workspaceId: row.workspace, userId: row.user_id, campaignId: row.campaign_id, intentId: row.intent_id });
      if (result?.stopped_at) counts.stopped++; else counts.pending++;
    } catch (error) { counts.pending++; logger.error("voice_dialer.stop_recovery_pending", { workspaceId: row.workspace, intentId: row.intent_id, error }); }
  }
  return counts;
}
