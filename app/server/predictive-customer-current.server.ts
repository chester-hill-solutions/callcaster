import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { call, outreach_attempt, workspace_voice_reservation as reservations } from "@/db/schema";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { matchesFundedHumanCall } from "./predictive-human-admission.server";
import type { TenantDb } from "./tenant-db";

/** The caller retains the workspace fence through this read and its audio snapshot. */
export async function readPredictiveCustomerRecovery(tdb: TenantDb, userId: string) {
  const latest = await tdb.workspace_voice_reservation.findFirst({
    where: and(eq(reservations.user_id, userId), isNotNull(reservations.human_revision)),
    orderBy: [desc(reservations.human_revision)], columns: { human_revision: true },
  });
  const revision = String(latest?.human_revision ?? 0);
  const owner = await tdb.workspace_voice_reservation.findFirst({
    where: and(eq(reservations.user_id, userId), inArray(reservations.human_state, ["pending", "joined"])),
  });
  if (!owner) return { revision, customer: null };
  if (!owner.provider_sid || !owner.conference_id || !owner.campaign_id || !owner.contact_id || !owner.outreach_attempt_id ||
    !owner.queue_id || !owner.human_revision || owner.kind !== "staffed") return null;
  const customer = await tdb.call.findFirst({ where: eq(call.sid, owner.provider_sid) });
  if (!customer || !matchesFundedHumanCall(customer, owner) || owner.provider_sid === owner.setup_sid || owner.provider_sid === owner.audio_agent_sid)
    return null;
  if (["released", "settled"].includes(owner.state) || owner.terminal_status || isTerminalStatus(normalizeProviderStatus(customer.status)))
    return { revision, customer: null };
  const attempt = await tdb.outreach_attempt.findFirst({ where: and(eq(outreach_attempt.id, owner.outreach_attempt_id),
    eq(outreach_attempt.user_id, userId), eq(outreach_attempt.campaign_id, owner.campaign_id), eq(outreach_attempt.contact_id, owner.contact_id)) });
  if (!attempt) return null;
  return { revision, customer: { workspace_id: owner.workspace, user_id: userId, call_sid: owner.provider_sid,
    campaign_id: owner.campaign_id, contact_id: owner.contact_id, outreach_attempt_id: owner.outreach_attempt_id,
    queue_id: owner.queue_id, attempt,
    conference_id: owner.conference_id, conference_sid: owner.conference_sid,
    conference_sequence: owner.human_conference_sequence, human_state: owner.human_state,
  } };
}
