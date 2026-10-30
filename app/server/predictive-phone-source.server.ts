import { and, desc, eq, isNotNull } from "drizzle-orm";
import { workspace_voice_audio_connection as connections, workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb } from "./tenant-db";
import type { VoiceAudioCustomerIntent } from "./voice-audio-customer-admission.server";

/** This is a descriptor, not readiness. A stopped or changed source must still be verified. */
export async function readPredictivePhoneAudioIntent(input: {
  workspaceId: string; userId: string; campaignId: number; conferenceId: string;
}): Promise<VoiceAudioCustomerIntent | null> {
  const tdb = createTenantDb(input.workspaceId);
  const connection = await tdb.workspace_voice_audio_connection.findFirst({ where: and(
    eq(connections.user_id, input.userId), eq(connections.conference_id, input.conferenceId),
  ), orderBy: [desc(connections.generation)] });
  if (connection) return { connectionId: connection.id, generation: connection.generation,
    destination: connection.destination, mode: "predictive" };
  // A removed audio row cannot turn an adopted room back into a legacy send.
  const owner = await tdb.workspace_voice_reservation.findFirst({ where: and(
    eq(reservations.user_id, input.userId), eq(reservations.campaign_id, input.campaignId),
    eq(reservations.conference_id, input.conferenceId), isNotNull(reservations.audio_connection_id),
    eq(reservations.audio_mode, "predictive"),
  ), orderBy: [desc(reservations.created_at)] });
  if (!owner) return null;
  if (!owner.audio_connection_id || owner.audio_generation == null || !owner.audio_destination)
    throw new Error("Predictive phone provenance is incomplete");
  return { connectionId: owner.audio_connection_id, generation: owner.audio_generation,
    destination: owner.audio_destination, mode: "predictive" };
}
