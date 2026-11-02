import { findVoiceReservationForCall } from "@/server/voice-bridge-reservation.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";

/** A funded SDK parent and a direct phone customer resolve to the same recipient. */
export async function findFundedVoicedropCustomer(workspaceId: string, requestedSid: string, campaignId: number) {
  const reservation = await findVoiceReservationForCall(workspaceId, requestedSid);
  if (!reservation) return null;
  const callSid = reservation.provider_sid;
  if (!callSid || reservation.campaign_id !== campaignId || reservation.recipient_refused_at ||
    ["settled", "released"].includes(reservation.state) || isTerminalStatus(normalizeProviderStatus(reservation.terminal_status)))
    throw new Error("Customer call is unavailable");
  const call = await findCallBySid(callSid);
  if (!call || call.workspace !== workspaceId || call.campaign_id !== campaignId || !call.contact_id ||
    isTerminalStatus(normalizeProviderStatus(call.status))) throw new Error("Customer call is unavailable");
  return { reservation, callSid };
}

/** Older SDK customers have no funding row; their agent parent is never a target. */
export async function findLegacyVoicedropCustomer(workspaceId: string, requestedSid: string, campaignId: number) {
  if (!/^CA[0-9a-f]{32}$/i.test(requestedSid)) return null;
  const call = await findCallBySid(requestedSid);
  if (!call || call.workspace !== workspaceId || call.campaign_id !== campaignId || !call.contact_id ||
    !call.parent_call_sid || call.direction !== "outbound-dial" || isTerminalStatus(normalizeProviderStatus(call.status))) return null;
  return call.sid;
}
