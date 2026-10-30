import { and, eq } from "drizzle-orm";
import { workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "./db";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioCustomerIntent } from "./voice-audio-customer-admission.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export type PredictiveStartIntent = { to: string; callerId: string; intentKey: string };
export type PredictiveConferenceStartIdentity = {
  workspaceId: string; campaignId: number; userId: string; conferenceId?: string; accountSid?: string;
  setup: PredictiveStartIntent; audioSource?: VoiceAudioCustomerIntent;
};

function sameSource(row: VoiceReservation, input: PredictiveConferenceStartIdentity) {
  const source = input.audioSource;
  if (!source) return !row.audio_connection_id && row.setup_to === input.setup.to && row.conference_id === input.conferenceId;
  return row.setup_to === null && row.setup_client_identity === null && input.setup.to === source.destination && source.mode === "predictive" &&
    row.audio_connection_id === source.connectionId && row.audio_generation === source.generation &&
    row.audio_destination === source.destination && row.audio_mode === source.mode &&
    (input.conferenceId === undefined || row.conference_id === input.conferenceId);
}

/** The HTTP boundary has already authorized the workspace and selected agent. */
export async function replayPredictiveConferenceStart(input: PredictiveConferenceStartIdentity) {
  return db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, input.workspaceId)).for("no key update");
    return repeatedConferenceStart(tx, input);
  });
}

/** Accepted identity is independent of current phone, campaign and queue readiness. */
export async function repeatedConferenceStart(tx: CreditTransaction, input: PredictiveConferenceStartIdentity) {
  const [row] = await tx.select().from(reservations).where(and(
    eq(reservations.workspace, input.workspaceId), eq(reservations.operation_key, input.setup.intentKey),
  )).limit(1);
  if (!row || row.state === "released" && !row.setup_sid && !row.provider_sid) return null;
  const callSid = input.audioSource ? row.provider_sid : row.setup_sid;
  if (!callSid || !row.conference_id || row.user_id !== input.userId || row.campaign_id !== input.campaignId ||
    row.caller_id !== input.setup.callerId || input.accountSid !== undefined && row.account_sid !== input.accountSid || !sameSource(row, input))
    return { ok: false as const, reason: "dispatch_in_progress" as const };
  if (input.audioSource) await persistReservedVoiceCall(tx, row, callSid);
  return { ok: false as const, reason: "already_dispatched" as const, callSid, conferenceName: row.conference_id,
    queueGeneration: row.queue_generation };
}
