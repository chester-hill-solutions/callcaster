import { and, eq, isNotNull, or } from "drizzle-orm";
import { call, campaign, handset_session, user, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { getUserRole, WORKSPACE_MEMBERSHIP_ROLES } from "@/lib/workspace-membership.server";
import { checkSchedule } from "@/lib/database/campaign.server";
import { getHandsetNumberForWorkspace } from "@/lib/database/workspace.server";
import { resolveCallerIdUsability } from "@/lib/caller-id-usability.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { normalizePhoneNumber } from "@/lib/phone";
import { voiceAudioRefusal, type VoiceAudioConnectionInput } from "@/lib/voice-audio-connection";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";
import { predictiveConferenceCallbackUrl } from "./predictive-conference-reservation.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { hasActiveVoiceAudioCustomer, hasFundedAgentVoice } from "./voice-audio-classification.server";
import { readManualVoiceAudioTopology } from "./voice-audio-manual-topology.server";

export async function lockVoiceAudioMember(tx: CreditTransaction, args: Pick<VoiceAudioConnectionInput, "workspaceId" | "userId">, allowDisabledWorkspace = false) {
  const [owner] = await tx.select().from(workspace).where(eq(workspace.id, args.workspaceId)).for("no key update");
  if (!owner || owner.archived_at) return voiceAudioRefusal("workspace_not_found");
  if (owner.disabled && !allowDisabledWorkspace) return voiceAudioRefusal("workspace_unavailable");
  const tdb = createTenantDb(args.workspaceId, tx);
  const membership = await getUserRole({ user: { id: args.userId }, workspaceId: args.workspaceId, tdb });
  const [actor] = await tx.select({ access: user.access_level, numbers: user.verified_audio_numbers }).from(user).where(eq(user.id, args.userId));
  if (!actor || actor.access === "disabled" || !membership || !WORKSPACE_MEMBERSHIP_ROLES.some((r) => r === membership.role))
    return voiceAudioRefusal("agent_not_found");
  return { ok: true as const, owner, actor, tdb };
}

export async function lockVoiceAudioActor(tx: CreditTransaction, args: Pick<VoiceAudioConnectionInput, "workspaceId" | "userId">) {
  const member = await lockVoiceAudioMember(tx, args);
  if (!member.ok) return member;
  const credentials = readTwilioWorkspaceCredentials(member.owner.twilio_data);
  if (!credentials) return voiceAudioRefusal("caller_id_unavailable");
  return { ...member, accountSid: credentials.sid };
}

type Actor = Extract<Awaited<ReturnType<typeof lockVoiceAudioActor>>, { ok: true }>;
export type VoiceAudioTarget = {
  kind: VoiceAudioConnection["target_kind"]; key: string; reservationId: string | null;
  campaignId: number | null; customerSid: string | null; originalAgentSid: string | null;
  conferenceId: string | null; conferenceSid: string | null; conferenceCallback: string | null;
  callerId: string; clientIdentity: string;
};

async function ownsLiveCall(tdb: TenantDb, sid: string) {
  const row = await tdb.call.findFirst({ where: eq(call.sid, sid), columns: { status: true } });
  return row && !isTerminalStatus(normalizeProviderStatus(row.status));
}

function conferenceOrigin(root: VoiceReservation | null, source: VoiceAudioConnection | null, userId: string) {
  return {
    originalAgentSid: root?.setup_sid ?? source?.original_agent_sid ?? source?.provider_sid,
    conferenceSid: root?.conference_sid ?? source?.conference_sid,
    conferenceCallback: source?.conference_callback ?? (root ? predictiveConferenceCallbackUrl(root) : null),
    clientIdentity: root?.setup_client_identity ?? userId,
  };
}

async function conferenceTarget(actor: Actor, args: VoiceAudioConnectionInput, row: VoiceReservation, current: VoiceAudioConnection | null) {
  const tdb = actor.tdb;
  const roots = await tdb.workspace_voice_reservation.findMany({ where: and(
      eq(reservations.conference_id, row.conference_id ?? ""), eq(reservations.account_sid, actor.accountSid),
      eq(reservations.user_id, args.userId), isNotNull(reservations.setup_sid),
    ), limit: 2 });
  const root = roots.length === 1 ? roots[0] ?? null : null;
  const source = current?.conference_id === row.conference_id ? current : null;
  const origin = conferenceOrigin(root, source, args.userId);
  const { originalAgentSid, conferenceSid } = origin;
  if (!originalAgentSid || !conferenceSid) return voiceAudioRefusal("target_inactive");
  if (!source && !await liveConferenceRoot(tdb, root)) return voiceAudioRefusal("target_inactive");
  if (current && !source) return voiceAudioRefusal("stale_audio");
  return { ok: true as const, target: { kind: "conference" as const, key: `conference:${row.conference_id}`,
      reservationId: row.id, campaignId: row.campaign_id, customerSid: row.provider_sid, originalAgentSid,
      conferenceId: row.conference_id, conferenceSid,
      conferenceCallback: origin.conferenceCallback,
      callerId: row.caller_id, clientIdentity: origin.clientIdentity } };
}

async function liveConferenceRoot(tdb: TenantDb, root: VoiceReservation | null) {
  return Boolean(root?.setup_sid && !root.setup_terminal_at && await ownsLiveCall(tdb, root.setup_sid));
}

async function directTarget(tdb: TenantDb, row: VoiceReservation, current: VoiceAudioConnection | null, userId: string) {
  if (!row.provider_sid || !row.setup_sid || row.state !== "active" || !await ownsLiveCall(tdb, row.provider_sid))
    return voiceAudioRefusal("target_inactive");
  const source = current?.reservation_id === row.id ? current : null;
  if (current && !source) return voiceAudioRefusal("stale_audio");
  if (!source && (!row.setup_continuation_url || row.setup_terminal_at || !await ownsLiveCall(tdb, row.setup_sid)))
    return voiceAudioRefusal("handoff_unavailable");
  return manualTargetWithTopology(tdb, row, source, userId);
}

async function manualTargetWithTopology(tdb: TenantDb, row: VoiceReservation, source: VoiceAudioConnection | null, userId: string) {
  const topology = await readManualVoiceAudioTopology(tdb, row, userId);
  if (!topology.ok) return topology;
  const canonical = topology.connection;
  if (source && canonical && (source.conference_id !== canonical.conference_id || source.conference_sid !== canonical.conference_sid ||
    source.conference_callback !== canonical.conference_callback)) return voiceAudioRefusal("stale_audio");
  const conference = canonical ?? source;
  return { ok: true as const, target: { kind: "direct" as const, key: `direct:${row.id}`,
    reservationId: row.id, campaignId: row.campaign_id, customerSid: row.provider_sid, originalAgentSid: row.setup_sid,
    conferenceId: conference?.conference_id ?? null, conferenceSid: conference?.conference_sid ?? null,
    conferenceCallback: conference?.conference_callback ?? null, callerId: row.caller_id,
    clientIdentity: row.setup_client_identity ?? userId } };
}

async function liveTarget(actor: Actor, args: VoiceAudioConnectionInput, current: VoiceAudioConnection | null) {
  const row = await actor.tdb.workspace_voice_reservation.findFirst({ where: and(
    eq(reservations.user_id, args.userId), eq(reservations.kind, "staffed"),
    or(eq(reservations.provider_sid, args.callSid ?? ""), eq(reservations.setup_sid, args.callSid ?? "")),
  ) });
  if (!row) return voiceAudioRefusal("target_not_found");
  if (row.account_sid !== actor.accountSid) return voiceAudioRefusal("account_changed");
  return row.conference_id ? conferenceTarget(actor, args, row, current) : directTarget(actor.tdb, row, current, args.userId);
}

function currentConference(current: VoiceAudioConnection | null) {
  return { conferenceId: current?.conference_id ?? null, conferenceSid: current?.conference_sid ?? null,
    conferenceCallback: current?.conference_callback ?? null };
}

async function idleTarget(actor: Actor, args: VoiceAudioConnectionInput, current: VoiceAudioConnection | null) {
  if (args.transport !== "phone") return voiceAudioRefusal("target_not_found");
  if (await hasFundedAgentVoice(actor.tdb, args.userId)) return voiceAudioRefusal("stale_audio");
  if (current && (current.target_kind !== "idle" || current.campaign_id !== (args.campaignId ?? null)))
    return voiceAudioRefusal("stale_audio");
  if (current && await hasActiveVoiceAudioCustomer(actor.tdb, current.conference_id)) return voiceAudioRefusal("stale_audio");
  if (args.campaignId != null) {
    const owned = await actor.tdb.campaign.findFirst({ where: eq(campaign.id, args.campaignId) });
    if (!owned) return voiceAudioRefusal("target_not_found");
    if (!checkSchedule(owned)) return voiceAudioRefusal("target_inactive");
  }
  const { data: handset } = await getHandsetNumberForWorkspace({ workspaceId: args.workspaceId, tdb: actor.tdb });
  if (!handset?.phone_number) return voiceAudioRefusal("caller_id_unavailable");
  return { ok: true as const, target: { kind: "idle" as const, key: `idle:${args.campaignId ?? "workspace"}`,
    reservationId: null, campaignId: args.campaignId ?? null, customerSid: null, originalAgentSid: null,
    ...currentConference(current), callerId: handset.phone_number, clientIdentity: args.userId } };
}

export async function resolveVoiceAudioAdmission(actor: Actor, args: VoiceAudioConnectionInput, current: VoiceAudioConnection | null) {
  const resolved = args.callSid ? await liveTarget(actor, args, current) : await idleTarget(actor, args, current);
  if (!resolved.ok) return resolved;
  const target = resolved.target;
  const sourceSid = current?.provider_sid ?? target.originalAgentSid;
  if (args.callSid && sourceSid !== args.expectedAgentSid) return voiceAudioRefusal("stale_audio");
  if ((await resolveCallerIdUsability(args.workspaceId, target.callerId, { tdb: actor.tdb })).kind !== "ok")
    return voiceAudioRefusal("caller_id_unavailable");
  let destination: string;
  if (args.transport === "phone") {
    try { destination = normalizePhoneNumber(args.phoneNumber ?? ""); }
    catch { return voiceAudioRefusal("device_not_verified"); }
    if (!actor.actor.numbers?.includes(destination)) return voiceAudioRefusal("device_not_verified");
  } else {
    if (target.clientIdentity !== args.userId) {
      const session = await actor.tdb.handset_session.findFirst({ where: and(
        eq(handset_session.client_identity, target.clientIdentity), eq(handset_session.user_id, args.userId),
        eq(handset_session.status, "active"),
      ) });
      if (!session || new Date(session.expires_at).getTime() <= Date.now()) return voiceAudioRefusal("device_not_verified");
    }
    destination = `client:${target.clientIdentity}`;
  }
  return { ok: true as const, target, destination, sourceSid };
}
