import { and, eq, inArray, like } from "drizzle-orm";
import { call, outreach_attempt, workspace_voice_reservation as reservations } from "@/db/schema";
import { normalizeProviderStatus } from "@/lib/call-status";
import { voiceCallLegIdentity } from "@/lib/voice-bridge-identity";
import { matchesFundedHumanCall } from "./predictive-human-admission.server";
import type { TenantDb } from "./tenant-db";
import type { VoiceReservation } from "./voice-credit-reservation.server";

type ManualOwner = VoiceReservation & { operation_key: string; campaign_id: number; contact_id: number; queue_id: number;
  outreach_attempt_id: number; queue_generation: string; provider_sid: string };
function hasManualCustomerIdentity(owner: VoiceReservation, userId: string): owner is ManualOwner {
  return Boolean(owner.provider_sid && owner.operation_key?.startsWith(`manual:${userId}:`) && owner.campaign_id && owner.contact_id && owner.queue_id &&
    owner.outreach_attempt_id && owner.queue_generation && owner.provider_sid !== owner.setup_sid && owner.provider_sid !== owner.audio_agent_sid);
}

/** Read the one unresolved manual customer under the existing workspace fence. */
export async function readManualCustomerRecovery(tdb: TenantDb, userId: string) {
  const owners = await tdb.workspace_voice_reservation.findMany({ where: and(
    eq(reservations.user_id, userId), eq(reservations.kind, "staffed"),
    inArray(reservations.state, ["reserved", "creating", "active"]), like(reservations.operation_key, "manual:%")), limit: 2 });
  if (!owners.length) return { customer: null };
  if (owners.length !== 1) return null;
  const owner = owners[0];
  if (!owner) return null;
  if (!owner.provider_sid) return { customer: null };
  const prefix = `manual:${userId}:`;
  if (!hasManualCustomerIdentity(owner, userId)) return null;
  const customer = await tdb.call.findFirst({ where: eq(call.sid, owner.provider_sid) });
  const identity = voiceCallLegIdentity(owner, "recipient");
  if (!customer || !matchesFundedHumanCall(customer, owner) || customer.to !== identity.to || customer.from !== identity.from ||
    customer.direction !== identity.direction || customer.parent_call_sid !== identity.parent_call_sid) return null;
  const status = normalizeProviderStatus(customer.status);
  if (!status) return null;
  const attempt = await tdb.outreach_attempt.findFirst({ where: and(eq(outreach_attempt.id, owner.outreach_attempt_id),
    eq(outreach_attempt.user_id, userId), eq(outreach_attempt.campaign_id, owner.campaign_id), eq(outreach_attempt.contact_id, owner.contact_id)) });
  if (!attempt) return null;
  return { customer: { reservation_id: owner.id, dial_intent_id: owner.operation_key.slice(prefix.length),
    workspace_id: owner.workspace, user_id: userId, call_sid: owner.provider_sid, agent_call_sid: owner.audio_agent_sid ?? owner.setup_sid,
    provider_status: status, campaign_id: owner.campaign_id, contact_id: owner.contact_id, queue_id: owner.queue_id,
    outreach_attempt_id: owner.outreach_attempt_id, attempt, conference_id: owner.conference_id,
    request: { to_number: owner.recipient, caller_id: owner.caller_id,
      selected_device: owner.audio_destination ?? (owner.setup_to === `client:${userId}` ? "computer" : owner.setup_to),
      requested_outreach_attempt_id: owner.requested_outreach_attempt_id, queue_generation: owner.queue_generation,
      audio_connection_id: owner.audio_connection_id, audio_generation: owner.audio_generation },
  } };
}
