import { and, eq, ne } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { VoiceAudioBindingError, voiceAudioParticipantLabel, voiceAudioRefusal, voiceAudioStartsMuted, type VoiceAudioFailureReason } from "@/lib/voice-audio-connection";
import { lockVoiceAudioMember, resolveVoiceAudioAdmission } from "./voice-audio-admission.server";
import { hasFundedAgentVoice } from "./voice-audio-classification.server";
import { voiceAudioSavedInput, withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";
import { getOutboundHeldCredits, type CreditTransaction } from "./outbound-credit-reservations.server";

async function refuseInstruction(tx: CreditTransaction, row: VoiceAudioConnection, reason: VoiceAudioFailureReason) {
  await tx.update(connections).set({ cancel_requested_at: row.cancel_requested_at ?? new Date(), lease_expires_at: new Date(), updated_at: new Date() })
    .where(eq(connections.id, row.id));
  return voiceAudioRefusal(reason);
}

function canIssueInstruction(current: VoiceAudioConnection | undefined, expected: VoiceAudioConnection): current is VoiceAudioConnection {
  return Boolean(current && current.user_id === expected.user_id && current.provider_sid && current.provider_sid === expected.provider_sid &&
    !current.cancel_requested_at && !current.terminal_at && ["joining", "ready", "active"].includes(current.state));
}

async function confirmPhoneInstruction(tx: CreditTransaction, row: VoiceAudioConnection, confirmation?: string) {
  if (row.transport !== "phone" || confirmation === "1") return null;
  if (confirmation === undefined) return { ok: true as const, connection: row, confirmed: false, replayed: false };
  return refuseInstruction(tx, row, "device_not_verified");
}

/** Authenticate and bind the physical call before issuing this one saved join. */
export async function issueVoiceAudioInstruction(row: VoiceAudioConnection, confirmation?: string) {
  return db.transaction(async (tx) => {
    const args = voiceAudioSavedInput(row), member = await lockVoiceAudioMember(tx, args, true);
    if (!member.ok) return member;
    const [current] = await tx.select().from(connections).where(and(eq(connections.id, row.id), eq(connections.workspace, row.workspace))).for("update");
    if (!canIssueInstruction(current, row)) return voiceAudioRefusal("stale_audio");
    if (current.voice_issued_at) return { ok: true as const, connection: current, confirmed: true, replayed: true };
    if (member.owner.disabled) return refuseInstruction(tx, current, "workspace_unavailable");
    const credentials = readTwilioWorkspaceCredentials(member.owner.twilio_data);
    if (credentials?.sid !== current.account_sid) return refuseInstruction(tx, current, "account_changed");
    const active = await member.tdb.workspace_voice_audio_connection.findFirst({ where: and(
      eq(connections.user_id, row.user_id), eq(connections.state, "active"), ne(connections.id, row.id),
    ) }) ?? null;
    if ((active?.id ?? null) !== current.source_connection_id) return refuseInstruction(tx, current, "stale_audio");
    const admission = await resolveVoiceAudioAdmission({ ...member, accountSid: credentials.sid }, args, active);
    if (!admission.ok) return refuseInstruction(tx, current, admission.reason);
    if (admission.destination !== current.destination || admission.target.key !== current.target_key || admission.sourceSid !== current.source_agent_sid)
      return refuseInstruction(tx, current, "stale_audio");
    if (current.target_kind === "idle" && member.owner.credits - await getOutboundHeldCredits(tx, current.workspace) <= 0)
      return refuseInstruction(tx, current, "insufficient_credits");
    const confirmationResult = await confirmPhoneInstruction(tx, current, confirmation);
    if (confirmationResult) return confirmationResult;
    const [issued] = await tx.update(connections).set({ voice_issued_at: new Date(), updated_at: new Date() }).where(eq(connections.id, current.id)).returning();
    if (!issued) throw new Error("Agent audio instruction was not saved");
    return { ok: true as const, connection: issued, confirmed: true, replayed: false };
  });
}

export type VoiceAudioConferenceEvent = {
  workspaceId: string; accountSid: string; requestUrl: string; conferenceId: string; conferenceSid: string;
  callSid: string; participantLabel: string; muted: string; event: "participant-join" | "participant-leave";
};

function assertConferenceIdentity(row: VoiceAudioConnection, input: VoiceAudioConferenceEvent) {
  if (!row.voice_issued_at || row.account_sid !== input.accountSid || row.conference_callback !== input.requestUrl ||
    row.conference_id !== input.conferenceId || row.conference_sid && row.conference_sid !== input.conferenceSid ||
    input.participantLabel !== voiceAudioParticipantLabel(row)) throw new VoiceAudioBindingError("Agent audio participant does not match its conference");
}

async function canCommitIdleAudio(tx: CreditTransaction, row: VoiceAudioConnection) {
  if (row.target_kind !== "idle" || row.source_connection_id || row.source_agent_sid) return false;
  const member = await lockVoiceAudioMember(tx, { workspaceId: row.workspace, userId: row.user_id }, true);
  if (!member.ok || member.owner.disabled || await hasFundedAgentVoice(member.tdb, row.user_id)) return false;
  if (member.owner.credits - await getOutboundHeldCredits(tx, row.workspace) <= 0) return false;
  const active = await member.tdb.workspace_voice_audio_connection.findFirst({ where: and(
    eq(connections.user_id, row.user_id), eq(connections.state, "active"), ne(connections.id, row.id),
  ), columns: { id: true } });
  return !active;
}

async function observeAudioJoin(tx: CreditTransaction, row: VoiceAudioConnection, input: VoiceAudioConferenceEvent) {
  if (input.muted !== String(voiceAudioStartsMuted(row))) throw new VoiceAudioBindingError("Agent audio participant has an unexpected mute role");
  const firstIdle = row.target_kind === "idle" && !row.source_connection_id && !row.source_agent_sid;
  const active = await canCommitIdleAudio(tx, row);
  const abandoned = firstIdle && !active;
  const [saved] = await tx.update(connections).set({ conference_sid: input.conferenceSid, joined_at: row.joined_at ?? new Date(),
    state: abandoned ? "failed" : active ? "active" : "ready", committed_at: active ? new Date() : row.committed_at,
    cancel_requested_at: abandoned ? new Date() : row.cancel_requested_at, lease_expires_at: abandoned ? new Date() : row.lease_expires_at,
    updated_at: new Date(),
  }).where(eq(connections.id, row.id)).returning();
  if (!saved) throw new Error("Agent audio join was not saved");
  return saved;
}

/** Resolve the actual participant; the callback owner may be an earlier generation. */
export async function observeVoiceAudioConferenceEvent(input: VoiceAudioConferenceEvent) {
  if (!/^CF[0-9a-f]{32}$/i.test(input.conferenceSid)) throw new VoiceAudioBindingError("Invalid agent audio conference SID");
  const row = await createTenantDb(input.workspaceId).workspace_voice_audio_connection.findFirst({ where: eq(connections.provider_sid, input.callSid) });
  if (!row) return null;
  return withVoiceAudioConnection(row, async (tx, current) => {
    assertConferenceIdentity(current, input);
    if (current.terminal_at || current.cancel_requested_at || ["retired", "failed", "canceled"].includes(current.state)) return current;
    if (input.event === "participant-leave") {
      const [left] = await tx.update(connections).set({ state: "failed", cancel_requested_at: new Date(), lease_expires_at: new Date(), updated_at: new Date() })
        .where(eq(connections.id, current.id)).returning();
      return left ?? current;
    }
    if (current.state === "active" || current.joined_at) return current;
    return observeAudioJoin(tx, current, input);
  });
}

/** The promoted customer and original parent retain their customer call identities. */
export async function observeVoiceAudioBridgeEvent(owner: VoiceAudioConnection, input: {
  accountSid: string; requestUrl: string; conferenceId: string; conferenceSid: string; callSid: string; joined: boolean;
}) {
  return withVoiceAudioConnection(owner, async (tx, current) => {
    if (!current.promotion_requested_at || current.account_sid !== input.accountSid || current.conference_callback !== input.requestUrl ||
      current.conference_id !== input.conferenceId || current.conference_sid !== input.conferenceSid ||
      ![current.customer_sid, current.original_agent_sid].includes(input.callSid)) throw new VoiceAudioBindingError("Agent audio bridge participant is not owned");
    if (!input.joined) return current;
    const [saved] = await tx.update(connections).set({
      customer_joined_at: input.callSid === current.customer_sid ? current.customer_joined_at ?? new Date() : current.customer_joined_at,
      parent_joined_at: input.callSid === current.original_agent_sid ? current.parent_joined_at ?? new Date() : current.parent_joined_at,
      updated_at: new Date(),
    }).where(eq(connections.id, current.id)).returning();
    return saved ?? current;
  });
}
