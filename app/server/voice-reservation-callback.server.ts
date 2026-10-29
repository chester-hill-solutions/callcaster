import { and, eq } from "drizzle-orm";
import { call, campaign, campaign_queue, contact, outreach_attempt, predictive_machine_operation, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { normalizeProviderStatus } from "@/lib/call-status";
import { recordFundedPredictiveReceipt } from "./predictive-voice-receipt.server";
import { matchesStoredVoiceCallbackUrl } from "@/lib/twilio/callback-url";

async function survivingCallContext(tx: CreditTransaction, reservation: VoiceReservation) {
  // Customer data can be removed after the provider accepts a call. Keep its
  // billing identity, and lock only surviving tenant links through insertion.
  const [campaignRow] = reservation.campaign_id == null ? [] : await tx.select({ id: campaign.id }).from(campaign).where(and(
    eq(campaign.id, reservation.campaign_id), eq(campaign.workspace, reservation.workspace),
  )).for("key share");
  const [contactRow] = reservation.contact_id == null ? [] : await tx.select({ id: contact.id }).from(contact).where(and(
    eq(contact.id, reservation.contact_id), eq(contact.workspace, reservation.workspace),
  )).for("key share");
  const [attemptRow] = reservation.outreach_attempt_id == null ? [] : await tx.select({ id: outreach_attempt.id }).from(outreach_attempt).where(and(
    eq(outreach_attempt.id, reservation.outreach_attempt_id), eq(outreach_attempt.workspace, reservation.workspace),
  )).for("key share");
  const [queueRow] = reservation.queue_id == null ? [] : await tx.select({ id: campaign_queue.id }).from(campaign_queue).where(and(
    eq(campaign_queue.id, reservation.queue_id), eq(campaign_queue.workspace, reservation.workspace),
  )).for("key share");
  return { campaign_id: campaignRow?.id ?? null, contact_id: contactRow?.id ?? null,
    outreach_attempt_id: attemptRow?.id ?? null, queue_id: queueRow?.id ?? null };
}

export async function persistReservedVoiceCall(
  tx: CreditTransaction, reservation: VoiceReservation, callSid: string, purpose: "recipient" | "setup" = "recipient",
) {
  if (purpose === "recipient" && reservation.setup_sid) await persistReservedVoiceCall(tx, reservation, reservation.setup_sid, "setup");
  const context = await survivingCallContext(tx, reservation);
  await tx.insert(call).values({
    ...context,
    ...(purpose === "setup" && reservation.conference_id ? { contact_id: null, outreach_attempt_id: null, queue_id: null } : {}),
    sid: callSid, workspace: reservation.workspace, account_sid: reservation.account_sid,
    to: purpose === "setup" ? reservation.setup_to : reservation.recipient, from: reservation.caller_id,
    parent_call_sid: purpose === "setup" || reservation.conference_id ? null : reservation.setup_sid,
    user_id: reservation.user_id, conference_id: reservation.conference_id,
    status: normalizeProviderStatus(purpose === "setup" ? reservation.setup_terminal_status : reservation.terminal_status) ?? "initiated",
    duration: purpose === "setup" ? null : reservation.terminal_duration,
    direction: purpose === "recipient" && reservation.setup_sid && !reservation.conference_id ? "outbound-dial" : "outbound-api",
  }).onConflictDoNothing({ target: call.sid });
  const [saved] = await tx.select().from(call).where(and(eq(call.sid, callSid), eq(call.workspace, reservation.workspace)));
  if (!saved || (saved.account_sid && saved.account_sid !== reservation.account_sid)) {
    throw new Error("Voice call belongs to a different dispatch");
  }
  return saved;
}

type VoiceReservationCallbackInput = {
  reservationId: string;
  accountSid: string;
  callSid: string;
  to: string;
  from: string;
  direction: string;
  requestUrl: string;
  entryPoint: "voice" | "status";
  machinePhase?: string | null;
  machineOperationId?: string | null;
  parentCallSid?: string | null;
};

async function expectedCallbackUrl(tx: CreditTransaction, reservation: VoiceReservation, args: VoiceReservationCallbackInput) {
  if (args.entryPoint !== "voice" || !args.machinePhase)
    return args.entryPoint === "voice" ? reservation.voice_url : reservation.status_callback;
  const [operation] = await tx.select().from(predictive_machine_operation).where(and(
    eq(predictive_machine_operation.workspace, reservation.workspace), eq(predictive_machine_operation.id, args.machineOperationId ?? ""),
    eq(predictive_machine_operation.call_sid, args.callSid), eq(predictive_machine_operation.conference_id, reservation.conference_id ?? ""),
  )).limit(1);
  if (!operation || !["wait", "complete"].includes(args.machinePhase)) throw new Error("Invalid funded machine phase");
  const phaseUrl = new URL(operation.ack_url);
  phaseUrl.searchParams.set("machine", args.machinePhase);
  return phaseUrl.href;
}

function matchesRecipientDispatch(reservation: VoiceReservation, args: VoiceReservationCallbackInput) {
  const parent = reservation.conference_id ? null : reservation.setup_sid;
  return reservation.account_sid === args.accountSid && reservation.recipient === args.to && reservation.caller_id === args.from &&
    args.direction === (parent ? "outbound-dial" : "outbound-api") && parent === (args.parentCallSid || null) &&
    (reservation.provider_sid === null || reservation.provider_sid === args.callSid);
}

/** Call only after validating the provider signature, including the URL query. */
export async function bindVoiceReservationCallback(args: VoiceReservationCallbackInput) {
  if (!/^[0-9a-f-]{36}$/i.test(args.reservationId) || !/^CA[0-9a-f]{32}$/i.test(args.callSid)) {
    throw new Error("Invalid voice reservation callback identity");
  }
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(reservations)
      .where(eq(reservations.id, args.reservationId)).for("update");
    if (!reservation || !reservation.send_started_at || reservation.state === "released" || reservation.recipient_refused_at ||
        !matchesRecipientDispatch(reservation, args) ||
        (reservation.setup_to !== null && !reservation.recipient_instruction_issued_at)) {
      throw new Error("Voice reservation callback does not match its dispatch");
    }
    if (!matchesStoredVoiceCallbackUrl(args.requestUrl, await expectedCallbackUrl(tx, reservation, args)))
      throw new Error("Voice callback URL does not match its dispatch");
    await recordFundedPredictiveReceipt(tx, reservation, args.callSid);
    const saved = await persistReservedVoiceCall(tx, reservation, args.callSid);
    await tx.update(reservations).set({
      provider_sid: args.callSid,
      state: reservation.state === "settled" ? "settled" : "active", updated_at: new Date(),
    }).where(eq(reservations.id, reservation.id));
    return saved;
  });
}
