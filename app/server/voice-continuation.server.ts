import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { workspace, workspace_voice_audio_connection as audio, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { voiceAudioSourceRetirementWhere } from "./voice-audio-classification.server";

export async function findVoiceContinuationOwner(id: string) {
  const [row] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return row ?? null;
}

function matchesParent(row: VoiceReservation, params: Record<string, string>, requestUrl: string) {
  if (row.kind !== "staffed" || !row.setup_sid || row.conference_id || row.setup_continuation_url !== requestUrl || row.account_sid !== params.AccountSid ||
    row.setup_sid !== params.CallSid || params.ParentCallSid || row.provider_sid && row.provider_sid !== params.DialCallSid) return false;
  // SDK To is a custom recipient request parameter. The actual SDK root is
  // fetched and checked separately before any conference instruction is issued.
  return row.setup_client_identity
    ? params.From === `client:${row.setup_client_identity}` && params.Direction === "inbound"
    : params.From === row.caller_id && params.To === row.setup_to && params.Direction === "outbound-api";
}

/** A signed parent action can resume only its already requested promotion. */
export async function bindVoiceContinuation(owner: VoiceReservation, params: Record<string, string>, requestUrl: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [row] = await tx.select().from(reservations).where(and(eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace))).for("update");
    if (!row || row.account_sid !== owner.account_sid || !matchesParent(row, params, requestUrl))
      throw new VoiceAudioBindingError("Manual continuation does not match its saved parent");
    const [successor] = await tx.select({ id: audio.id }).from(audio).where(voiceAudioSourceRetirementWhere({
      workspaceId: row.workspace, accountSid: row.account_sid, callSid: row.setup_sid ?? "",
    })).limit(1);
    if (successor) return { reservation: row, connection: null };
    const [candidate, extra] = await tx.select().from(audio).where(and(
      eq(audio.workspace, row.workspace), eq(audio.reservation_id, row.id), eq(audio.account_sid, row.account_sid),
      eq(audio.user_id, row.user_id ?? ""), eq(audio.target_kind, "direct"),
      eq(audio.original_agent_sid, row.setup_sid ?? ""), eq(audio.source_agent_sid, row.setup_sid ?? ""),
      isNull(audio.source_connection_id), isNotNull(audio.promotion_requested_at),
      isNotNull(audio.voice_issued_at), isNotNull(audio.joined_at), isNotNull(audio.conference_sid), isNotNull(audio.provider_sid),
      isNull(audio.committed_at), isNull(audio.conference_stop_requested_at),
    )).limit(2).for("update");
    if (extra) throw new VoiceAudioBindingError("Manual continuation has ambiguous promotion ownership");
    if (!candidate || row.state !== "active" || row.setup_terminal_at || !row.provider_sid || candidate.customer_sid !== row.provider_sid)
      return { reservation: row, connection: null };
    return { reservation: row, connection: candidate };
  });
}
