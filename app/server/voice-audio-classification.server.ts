import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { workspace_voice_audio_connection as connections, workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

/** Retirement retains this identity so late events cannot become customer usage. */
export async function isVoiceAudioLeg(workspaceId: string, callSid: string) {
  const row = await createTenantDb(workspaceId).workspace_voice_audio_connection.findFirst({
    where: eq(connections.provider_sid, callSid), columns: { id: true },
  });
  return Boolean(row);
}

export async function hasActiveVoiceAudioCustomer(tdb: TenantDb, conferenceId: string) {
  const row = await tdb.workspace_voice_reservation.findFirst({ where: and(
    eq(reservations.conference_id, conferenceId), inArray(reservations.state, ["reserved", "creating", "active"]),
  ), columns: { id: true } });
  return Boolean(row);
}

export async function hasFundedAgentVoice(tdb: TenantDb, userId: string) {
  const row = await tdb.workspace_voice_reservation.findFirst({ where: and(
    eq(reservations.user_id, userId), eq(reservations.kind, "staffed"), inArray(reservations.state, ["reserved", "creating", "active"]),
  ), columns: { id: true } });
  return Boolean(row);
}

type SourceIdentity = { workspaceId: string; accountSid: string; callSid: string; conferenceId?: string };

/** A source remains retired across ended replacement legs and later rooms. */
export function voiceAudioSourceRetirementWhere(args: SourceIdentity) {
  return and(eq(connections.workspace, args.workspaceId),
    eq(connections.account_sid, args.accountSid), eq(connections.source_agent_sid, args.callSid),
    args.conferenceId === undefined ? undefined : eq(connections.conference_id, args.conferenceId), isNotNull(connections.committed_at),
  );
}

export async function isRetiredVoiceAudioSource(args: SourceIdentity) {
  const row = await createTenantDb(args.workspaceId).workspace_voice_audio_connection.findFirst({
    where: voiceAudioSourceRetirementWhere(args), columns: { id: true },
  });
  return Boolean(row);
}
