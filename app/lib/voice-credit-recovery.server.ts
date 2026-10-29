import type Twilio from "twilio";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { eq } from "drizzle-orm";
import { call } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import {
  claimVoiceReservationRecovery, recordVoiceReservationProvider, releaseUnsentVoiceReservation,
  type VoiceReservation,
} from "@/server/voice-credit-reservation.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { billTerminalCallStatus, processCallStatusWebhook } from "@/lib/twilio-call-status.server";
import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";
import { hasTwilioCallRequestHistory, isTwilioCallHistoryReady } from "@/lib/twilio-call-history.server";
import { logger } from "@/lib/logger.server";

function terminalDuration(status: string | null, duration: string | null) {
  if (!status || !TERMINAL_CALL_STATUSES.has(status)) return null;
  if (status === "canceled") return 0;
  if (duration === null || duration.trim() === "") return null;
  const seconds = Number(duration);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function matchesReservation(reservation: VoiceReservation, candidate: CallInstance) {
  return candidate.accountSid === reservation.account_sid &&
    candidate.to === reservation.recipient && candidate.from === reservation.caller_id &&
    candidate.direction === (reservation.setup_sid ? "outbound-dial" : "outbound-api") &&
    (candidate.parentCallSid || null) === reservation.setup_sid;
}

async function adoptVerifiedCandidate(reservation: VoiceReservation, candidate: CallInstance, twilio: Twilio.Twilio) {
  if (!reservation.send_started_at || !reservation.voice_url || !reservation.status_callback ||
      !matchesReservation(reservation, candidate) || !isTwilioCallHistoryReady(candidate.endTime)) return false;
  if (!await hasTwilioCallRequestHistory({
    twilio, callSid: candidate.sid, accountSid: reservation.account_sid,
    voiceUrl: reservation.voice_url, statusCallback: reservation.status_callback,
  })) return false;
  await recordVoiceReservationProvider(reservation, candidate.sid);
  return true;
}

/** An operator-supplied SID still requires the original provider request history. */
export async function recoverVoiceReservationCall(reservation: VoiceReservation, candidateSid: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(candidateSid) || reservation.provider_sid) {
    throw new Error("Voice reservation is not eligible for candidate recovery");
  }
  const twilio = await originalAccountClient(reservation);
  const candidate = await twilio.calls(candidateSid).fetch();
  if (candidate.sid !== candidateSid || !await adoptVerifiedCandidate(reservation, candidate, twilio)) {
    throw new Error("Provider history does not prove the reserved voice call");
  }
  return candidate.sid;
}

async function originalAccountClient(reservation: VoiceReservation) {
  const twilio = await createWorkspaceTwilioInstance({ workspace_id: reservation.workspace });
  if (twilio.accountSid !== reservation.account_sid) {
    throw new Error("Voice recovery requires the original provider account");
  }
  return twilio;
}

async function findUnknownCall(reservation: VoiceReservation, twilio: Twilio.Twilio) {
  if (!reservation.send_started_at) return null;
  const rows = await twilio.calls.list({ to: reservation.recipient, from: reservation.caller_id, limit: 20 });
  const started = reservation.send_started_at.getTime();
  const candidates = rows.filter((candidate) => matchesReservation(reservation, candidate) &&
    candidate.dateCreated?.getTime() >= started - 5_000 && candidate.dateCreated.getTime() <= started + 120_000);
  // These filters locate candidates only. Exact request history authorizes
  // adoption; absence from a bounded list never frees a hold.
  if (!candidates.length || candidates.length > 3 || candidates.some((candidate) => !isTwilioCallHistoryReady(candidate.endTime))) return null;
  const matches: CallInstance[] = [];
  for (const candidate of candidates) {
    if (reservation.voice_url && reservation.status_callback && await hasTwilioCallRequestHistory({
      twilio, callSid: candidate.sid, accountSid: reservation.account_sid,
      voiceUrl: reservation.voice_url, statusCallback: reservation.status_callback,
    })) matches.push(candidate);
  }
  if (matches.length !== 1 || !matches[0]) return null;
  return matches[0];
}

async function reconcileVoiceReservation(reservation: VoiceReservation) {
  if (!reservation.send_started_at && reservation.state === "reserved") {
    return await releaseUnsentVoiceReservation(reservation, "not_sent") ? "released" : "pending";
  }
  if (reservation.provider_sid) {
    const local = await createTenantDb(reservation.workspace).call.findFirst({ where: eq(call.sid, reservation.provider_sid) });
    const localDuration = local?.duration ?? (local?.call_duration == null ? null : String(local.call_duration));
    if (local && terminalDuration(local.status, localDuration) !== null) {
      await billTerminalCallStatus(local);
      return "settled";
    }
  }
  const twilio = await originalAccountClient(reservation);
  const remote = reservation.provider_sid
    ? await twilio.calls(reservation.provider_sid).fetch()
    : await findUnknownCall(reservation, twilio);
  if (!remote || !matchesReservation(reservation, remote) ||
      (reservation.provider_sid && remote.sid !== reservation.provider_sid)) return "pending";
  await recordVoiceReservationProvider(reservation, remote.sid);
  const duration = terminalDuration(remote.status, remote.duration);
  if (duration === null) return "pending";
  await processCallStatusWebhook({
    sid: remote.sid, account_sid: remote.accountSid, to: remote.to, from: remote.from,
    parent_call_sid: remote.parentCallSid || null, direction: remote.direction,
    status: remote.status, duration: String(duration),
    date_updated: remote.dateUpdated ?? new Date(), end_time: remote.endTime ?? undefined,
  }, {
    workspaceId: reservation.workspace, note: `Call ${remote.sid} (credit reservation recovery)`,
  });
  return "settled";
}

export async function runVoiceCreditRecovery() {
  const rows = await claimVoiceReservationRecovery(10);
  const counts = { examined: rows.length, settled: 0, released: 0, pending: 0 };
  for (const reservation of rows) {
    try {
      counts[await reconcileVoiceReservation(reservation)]++;
    } catch (error) {
      counts.pending++;
      logger.error("voice_credit.recovery.failed", { workspaceId: reservation.workspace, reservationId: reservation.id, error });
    }
  }
  return counts;
}
