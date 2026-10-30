import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { voiceAudioRefusal } from "@/lib/voice-audio-connection";
import type { TenantDb } from "./tenant-db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

export async function hasUnresolvedVoiceAudioPromotion(tdb: TenantDb, userId: string) {
  const row = await tdb.workspace_voice_audio_connection.findFirst({ where: and(
    eq(connections.user_id, userId), eq(connections.target_kind, "direct"),
    isNotNull(connections.promotion_requested_at), isNull(connections.promotion_result),
  ), columns: { id: true } });
  return Boolean(row);
}

function ownsCanonicalRoom(row: VoiceAudioConnection, reservation: VoiceReservation, userId: string) {
  return Boolean(row.account_sid === reservation.account_sid && row.user_id === userId &&
    row.original_agent_sid === reservation.setup_sid && row.customer_sid === reservation.provider_sid &&
    row.voice_issued_at && row.joined_at && row.customer_joined_at && row.parent_joined_at && row.conference_sid);
}

/** The conference survives its first phone; billing provenance never changes. */
export async function readManualVoiceAudioTopology(tdb: TenantDb, reservation: VoiceReservation, userId: string) {
  const rows = await tdb.workspace_voice_audio_connection.findMany({ where: and(
    eq(connections.reservation_id, reservation.id), eq(connections.target_kind, "direct"),
    inArray(connections.promotion_result, ["ready", "closed"]),
  ), limit: 2 });
  if (rows.some(row => row.promotion_result === "closed")) return voiceAudioRefusal("target_inactive");
  const row = rows[0];
  if (!row) return { ok: true as const, connection: null };
  if (rows.length !== 1 || !ownsCanonicalRoom(row, reservation, userId)) return voiceAudioRefusal("stale_audio");
  return { ok: true as const, connection: row };
}

/** Confirmed room end fences every promotion still tied to that exact room. */
export async function closeManualVoiceAudioTopology(tx: CreditTransaction, row: VoiceAudioConnection) {
  if (!row.reservation_id || !row.conference_sid) return;
  await tx.update(connections).set({ promotion_result: "closed", updated_at: new Date() }).where(and(
    eq(connections.workspace, row.workspace), eq(connections.reservation_id, row.reservation_id),
    eq(connections.account_sid, row.account_sid), eq(connections.conference_id, row.conference_id),
    eq(connections.conference_sid, row.conference_sid), eq(connections.target_kind, "direct"),
    isNotNull(connections.promotion_requested_at),
  ));
}
