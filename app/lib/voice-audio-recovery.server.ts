import type Twilio from "twilio";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { hasTwilioCallRequestHistory, isTwilioCallHistoryReady } from "@/lib/twilio-call-history.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { logger } from "@/lib/logger.server";
import { findVoiceAudioConnection, recordVoiceAudioProvider, type VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { claimVoiceAudioRecovery, claimVoiceAudioStop, expireUnsentVoiceAudio, observeVoiceAudioStatus } from "@/server/voice-audio-lifecycle.server";

function matchesAudioLeg(row: VoiceAudioConnection, physical: CallInstance) {
  return physical.accountSid === row.account_sid && physical.to === row.destination && physical.from === row.caller_id &&
    physical.direction === "outbound-api" && !physical.parentCallSid;
}

async function hasAudioHistory(row: VoiceAudioConnection, physical: CallInstance, client: Twilio.Twilio) {
  return Boolean(row.send_started_at && matchesAudioLeg(row, physical) && isTwilioCallHistoryReady(physical) &&
    await hasTwilioCallRequestHistory({ twilio: client, callSid: physical.sid, voiceUrl: row.voice_url, statusCallback: row.status_callback }));
}

async function findUnknownAudioLeg(row: VoiceAudioConnection, client: Twilio.Twilio) {
  if (!row.send_started_at) return null;
  const started = row.send_started_at.getTime();
  const recent = await client.calls.list({ to: row.destination, from: row.caller_id, limit: 20 });
  const candidates = recent.filter((physical) => matchesAudioLeg(row, physical) &&
    physical.dateCreated?.getTime() >= started - 5_000 && physical.dateCreated.getTime() <= started + 120_000);
  if (!candidates.length || candidates.length > 3 || candidates.some((physical) => !isTwilioCallHistoryReady(physical))) return null;
  const proven: CallInstance[] = [];
  for (const physical of candidates) if (await hasAudioHistory(row, physical, client)) proven.push(physical);
  return proven.length === 1 ? proven[0] ?? null : null;
}

/** An operator candidate still needs the saved original-account callback history. */
export async function recoverVoiceAudioConnectionCall(row: VoiceAudioConnection, candidateSid: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(candidateSid) || row.provider_sid || !row.send_started_at)
    throw new Error("Agent audio connection is not eligible for candidate recovery");
  const client = await createOriginalVoiceAccountClient(row), physical = await client.calls(candidateSid).fetch();
  if (physical.sid !== candidateSid || !await hasAudioHistory(row, physical, client))
    throw new Error("Provider history does not prove the agent audio connection");
  await recordVoiceAudioProvider(row, physical.sid);
  return physical.sid;
}

async function reconcileAudio(row: VoiceAudioConnection): Promise<"closed" | "expired" | "pending"> {
  if (!row.send_started_at && row.state === "prepared") return await expireUnsentVoiceAudio(row) ? "expired" : "pending";
  const client = await createOriginalVoiceAccountClient(row);
  const physical = row.provider_sid ? await client.calls(row.provider_sid).fetch() : await findUnknownAudioLeg(row, client);
  if (!physical || !matchesAudioLeg(row, physical) || row.provider_sid && row.provider_sid !== physical.sid) return "pending";
  const saved = await recordVoiceAudioProvider(row, physical.sid);
  await observeVoiceAudioStatus(saved, physical.status, physical.duration);
  if (isTerminalStatus(normalizeProviderStatus(physical.status))) return "closed";
  const stopping = await claimVoiceAudioStop({ ...saved, lease_token: row.lease_token });
  if (!stopping) return "pending";
  const status = physical.status === "queued" || physical.status === "ringing" ? "canceled" : "completed";
  const stopped = await client.calls(physical.sid).update({ status });
  if (stopped.sid !== physical.sid || !matchesAudioLeg(stopping, stopped)) throw new Error("Agent audio stop response has a different identity");
  await observeVoiceAudioStatus(stopping, stopped.status, stopped.duration);
  return isTerminalStatus(normalizeProviderStatus(stopped.status)) ? "closed" : "pending";
}

export async function runVoiceAudioRecovery() {
  const rows = await claimVoiceAudioRecovery();
  const counts = { examined: rows.length, closed: 0, expired: 0, pending: 0 };
  for (const row of rows) {
    try { counts[await reconcileAudio(row)]++; }
    catch (error) {
      counts.pending++;
      logger.error("voice_audio.recovery_failed", { workspaceId: row.workspace, connectionId: row.id, error });
    }
  }
  return counts;
}

/** An explicit cancel can stop its known leg now; uncertain creation stays saved. */
export async function attemptVoiceAudioCancellation(row: VoiceAudioConnection) {
  if (!row.cancel_requested_at || !row.provider_sid || row.terminal_at) return row;
  try { await reconcileAudio(row); }
  catch (error) { logger.error("voice_audio.cancellation_pending", { connectionId: row.id, error }); }
  return await findVoiceAudioConnection(row.id) ?? row;
}
