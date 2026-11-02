import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { campaign, workspace, workspace_voice_dialer_intent as intents, workspace_voice_reservation as reservations,
  workspace_voice_audio_connection as connections } from "@/db/schema";
import { db } from "./db";
import { lockVoiceWorkspaceMember } from "./voice-workspace-member.server";
import { dialerIntentIdentity, findDialerIntent, type DialerIntentOwner, type VoiceDialerIntent } from "./voice-dialer-intent.server";
import type { VoiceDialerStopSnapshot } from "@/lib/schemas/api/voice-dialer-stop";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { voiceAudioSourceRetirementWhere } from "./voice-audio-classification.server";

/** The current-agent fence must be held before saving this room's Stop. */
export async function requestDialerRoomStop(tx: CreditTransaction, owner: { workspaceId: string; userId: string; accountSid: string; conferenceId: string }) {
  const rows = await tx.select().from(intents).where(and(eq(intents.workspace, owner.workspaceId), eq(intents.user_id, owner.userId),
    eq(intents.account_sid, owner.accountSid), eq(intents.conference_id, owner.conferenceId), isNull(intents.retired_at),
    isNotNull(intents.reservation_id))).limit(2);
  if (rows.length > 1) throw new Error("Agent hangup has ambiguous dialer ownership");
  const row = rows[0];
  if (!row || row.stop_requested_at) return row ?? null;
  const now = new Date();
  await tx.update(intents).set({ stop_requested_at: now, lease_expires_at: now, updated_at: now })
    .where(dialerIntentIdentity({ ...owner, intentId: row.intent_id, campaignId: row.campaign_id }));
  return row;
}

/** Caller owns workspace then reservation; terminal status and Stop commit together. */
export async function requestDialerAgentStopInTransaction(tx: CreditTransaction, row: VoiceReservation, callSid: string) {
  if (!row.user_id || !row.conference_id || row.setup_sid !== callSid) return false;
  const [successor] = await tx.select({ id: connections.id }).from(connections).where(voiceAudioSourceRetirementWhere({
    workspaceId: row.workspace, accountSid: row.account_sid, conferenceId: row.conference_id, callSid,
  })).limit(1);
  if (successor) return false;
  await requestDialerRoomStop(tx, { workspaceId: row.workspace, userId: row.user_id, accountSid: row.account_sid, conferenceId: row.conference_id });
  return true;
}

/** Order a signed browser-agent hangup against audio promotion and new admission. */
export function requestDialerStopForAgentHangup(owner: VoiceReservation, callSid: string) {
  return db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [row] = await tx.select().from(reservations).where(and(eq(reservations.id, owner.id),
      eq(reservations.workspace, owner.workspace))).for("update");
    return row && row.account_sid === owner.account_sid ? requestDialerAgentStopInTransaction(tx, row, callSid) : false;
  });
}

export function dialerStopSnapshot(row: VoiceDialerIntent): VoiceDialerStopSnapshot {
  return { success: true, workspace_id: row.workspace, user_id: row.user_id, campaign_id: row.campaign_id,
    intent_id: row.intent_id, conference_id: row.conference_id, stop_state: row.stopped_at ? "stopped" : "pending" };
}

/** Stop is durable before any provider lookup, including before Start admission. */
export function requestDialerStop(owner: DialerIntentOwner, conferenceName?: string) {
  return db.transaction(async tx => {
    const member = await lockVoiceWorkspaceMember(tx, owner, true);
    if (!member.ok) return { ok: false as const, status: 404 as const };
    const saved = await findDialerIntent(tx, owner);
    if (saved && saved.campaign_id !== owner.campaignId) return { ok: false as const, status: 404 as const };
    if (saved?.conference_id && conferenceName && saved.conference_id !== conferenceName) return { ok: false as const, status: 409 as const };
    if (saved?.stop_requested_at) return { ok: true as const, intent: saved };
    const now = new Date();
    if (!saved) {
      const ownCampaign = await member.tdb.campaign.findFirst({ where: eq(campaign.id, owner.campaignId) });
      if (!ownCampaign) return { ok: false as const, status: 404 as const };
      const [intent] = await tx.insert(intents).values({ workspace: owner.workspaceId, user_id: owner.userId,
        campaign_id: owner.campaignId, intent_id: owner.intentId, stop_requested_at: now, stopped_at: now }).returning();
      if (!intent) throw new Error("Dialer cancellation was not saved");
      return { ok: true as const, intent };
    }
    const [intent] = await tx.update(intents).set({ stop_requested_at: now, stopped_at: saved.retired_at ? now : null,
      lease_expires_at: now, updated_at: now }).where(dialerIntentIdentity(owner)).returning();
    if (!intent) throw new Error("Dialer Stop was not saved");
    return { ok: true as const, intent };
  });
}

export function claimDialerStop(owner: DialerIntentOwner) {
  return db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspaceId)).for("no key update");
    const [row] = await tx.update(intents).set({ lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + 30_000), updated_at: new Date() })
      .where(and(dialerIntentIdentity(owner), eq(intents.campaign_id, owner.campaignId), isNotNull(intents.stop_requested_at),
        isNull(intents.stopped_at), lte(intents.lease_expires_at, new Date()))).returning();
    return row ?? null;
  });
}

export async function finishDialerStop(owner: VoiceDialerIntent, error: string | null) {
  const [saved] = await db.update(intents).set({ stopped_at: error ? null : new Date(), last_error: error,
    lease_expires_at: error ? new Date(Date.now() + 5_000) : new Date(), updated_at: new Date() })
    .where(and(dialerIntentIdentity({ workspaceId: owner.workspace, userId: owner.user_id, intentId: owner.intent_id, campaignId: owner.campaign_id }),
      eq(intents.lease_token, owner.lease_token), isNull(intents.stopped_at), isNotNull(intents.stop_requested_at))).returning();
  return saved ?? null;
}

export function listPendingDialerStops(limit = 10) {
  return db.select().from(intents).where(and(isNotNull(intents.stop_requested_at), isNull(intents.stopped_at),
    lte(intents.lease_expires_at, new Date()))).orderBy(intents.lease_expires_at).limit(limit);
}
