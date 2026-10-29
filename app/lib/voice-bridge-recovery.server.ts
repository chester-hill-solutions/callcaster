import type Twilio from "twilio";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import { recordVoiceReservationProvider } from "@/server/voice-credit-reservation.server";
import { observeVoiceBridgeSetupStatus, recordVoiceBridgeSetupProvider } from "@/server/voice-bridge-reservation.server";
import { hasTwilioCallRequestHistory, isTwilioCallHistoryReady } from "@/lib/twilio-call-history.server";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";
import { processCallStatusWebhook } from "@/lib/twilio-call-status.server";
import { settleRecoveredVoiceCall } from "@/lib/recovered-voice-status.server";

function matchesSetup(reservation: VoiceReservation, candidate: CallInstance) {
  return candidate.accountSid === reservation.account_sid && candidate.to === reservation.setup_to &&
    candidate.from === reservation.caller_id && candidate.direction === "outbound-api" && !candidate.parentCallSid;
}

function matchesRecipient(reservation: VoiceReservation, candidate: CallInstance) {
  return candidate.accountSid === reservation.account_sid && candidate.to === reservation.recipient &&
    candidate.from === reservation.caller_id && candidate.direction === "outbound-dial" &&
    candidate.parentCallSid === reservation.setup_sid;
}

async function setupHistory(reservation: VoiceReservation, root: CallInstance, twilio: Twilio.Twilio) {
  return isTwilioCallHistoryReady(root) && hasTwilioCallRequestHistory({ twilio, callSid: root.sid,
    voiceUrl: reservation.setup_voice_url, statusCallback: reservation.setup_status_callback });
}

async function unknownSetup(reservation: VoiceReservation, twilio: Twilio.Twilio) {
  if (!reservation.setup_to || !reservation.send_started_at) return null;
  const rows = await twilio.calls.list({ to: reservation.setup_to, from: reservation.caller_id, limit: 20 });
  const started = reservation.send_started_at.getTime();
  const candidates = rows.filter((candidate) => matchesSetup(reservation, candidate) &&
    candidate.dateCreated?.getTime() >= started - 5_000 && candidate.dateCreated.getTime() <= started + 120_000);
  if (!candidates.length || candidates.length > 3 || candidates.some((candidate) => !isTwilioCallHistoryReady(candidate))) return null;
  const matches: CallInstance[] = [];
  for (const candidate of candidates) if (await setupHistory(reservation, candidate, twilio)) matches.push(candidate);
  if (matches.length !== 1 || !matches[0]) return null;
  await recordVoiceBridgeSetupProvider(reservation, matches[0].sid);
  return matches[0];
}

async function childEvidence(reservation: VoiceReservation, root: CallInstance, child: CallInstance, twilio: Twilio.Twilio) {
  if (!reservation.recipient_instruction_issued_at || !matchesRecipient(reservation, child)) return false;
  if (isTwilioCallHistoryReady(child) && await hasTwilioCallRequestHistory({
    twilio, callSid: child.sid, statusCallback: reservation.status_callback,
  })) return true;
  return setupHistory(reservation, root, twilio);
}

async function unknownRecipient(reservation: VoiceReservation, root: CallInstance, twilio: Twilio.Twilio) {
  if (!reservation.setup_sid || !reservation.recipient_instruction_issued_at) return null;
  const children = await twilio.calls.list({ parentCallSid: reservation.setup_sid, limit: 20 });
  const candidates = children.filter((child) => matchesRecipient(reservation, child));
  if (candidates.length !== 1 || !candidates[0]) return null;
  const child = candidates[0];
  if (!await childEvidence(reservation, root, child, twilio)) return null;
  await recordVoiceReservationProvider(reservation, child.sid);
  return child;
}

/** The caller supplies a client already checked against the original account. */
export async function reconcileVoiceBridge(reservation: VoiceReservation, twilio: Twilio.Twilio) {
  const root = reservation.setup_sid ? await twilio.calls(reservation.setup_sid).fetch() : await unknownSetup(reservation, twilio);
  if (!root || !matchesSetup(reservation, root) || (reservation.setup_sid && root.sid !== reservation.setup_sid)) return "pending";
  const owned = await observeVoiceBridgeSetupStatus({ ...reservation, setup_sid: root.sid }, root);
  if (owned.state === "released") return "released";
  if (owned.state === "settled") return "settled";
  const child = owned.provider_sid ? await twilio.calls(owned.provider_sid).fetch() : await unknownRecipient(owned, root, twilio);
  if (!child || !matchesRecipient(owned, child) || (owned.provider_sid && child.sid !== owned.provider_sid)) return "pending";
  const duration = terminalVoiceCallDuration(child.status, child.duration);
  if (duration === null) return "pending";
  await recordVoiceReservationProvider(owned, child.sid);
  const { call: saved } = await processCallStatusWebhook({ sid: child.sid, account_sid: child.accountSid, to: child.to, from: child.from,
    parent_call_sid: root.sid, direction: child.direction, status: child.status, duration: String(duration),
    date_updated: child.dateUpdated ?? new Date(), end_time: child.endTime ?? undefined,
  }, { workspaceId: owned.workspace, skipBilling: true });
  await settleRecoveredVoiceCall(saved);
  return "settled";
}

export async function recoverVoiceBridgeCandidate(reservation: VoiceReservation, candidateSid: string, twilio: Twilio.Twilio) {
  const candidate = await twilio.calls(candidateSid).fetch();
  if (candidate.sid !== candidateSid) throw new Error("Unexpected voice recovery candidate");
  if (!reservation.setup_sid) {
    if (!matchesSetup(reservation, candidate) || !await setupHistory(reservation, candidate, twilio)) {
      throw new Error("Provider history does not prove the manual setup");
    }
    await recordVoiceBridgeSetupProvider(reservation, candidate.sid);
    return candidate.sid;
  }
  const root = await twilio.calls(reservation.setup_sid).fetch();
  if (!matchesSetup(reservation, root) || root.sid !== reservation.setup_sid ||
      !await childEvidence(reservation, root, candidate, twilio)) {
    throw new Error("Provider history does not prove the manual recipient");
  }
  await recordVoiceReservationProvider(reservation, candidate.sid);
  return candidate.sid;
}
