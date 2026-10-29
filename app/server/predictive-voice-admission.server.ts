import { and, eq, isNull, or } from "drizzle-orm";
import { campaign, campaign_queue, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { reserveVoiceCreditsInTransaction, startVoiceReservationInTransaction, type VoiceReservation, type VoiceDispatchUrls } from "./voice-credit-reservation.server";
import { claimNextQueueContact } from "@/lib/campaign-queue-db.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { checkSchedule } from "@/lib/database/campaign.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { resolveCallerIdUsability, callerIdRefusalMessage } from "@/lib/caller-id-usability.server";
import { VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { voiceBridgeUrl } from "@/lib/manual-voice-dispatch.server";
import { startVoiceBridgeReservationInTransaction } from "./voice-bridge-reservation.server";

type CoreRefusal = Extract<Awaited<ReturnType<typeof reserveVoiceCreditsInTransaction>>, { ok: false }>;
type PredictiveRefusal = CoreRefusal | { ok: false; reason: "campaign_not_found" | "campaign_deferred" | "campaign_stopped" | "queue_pending" | "outside_window" | "queue_empty" }
  | { ok: false; reason: "caller_id_unavailable"; message: string };
class AdmissionRollback extends Error {
  constructor(readonly result: PredictiveRefusal) { super(result.reason); }
}

export type PredictiveVoiceAdmissionInput = {
  workspaceId: string; campaignId: number; userId: string; conferenceId: string; accountSid: string;
  operationId?: string;
  setup?: { to: string; callerId: string; intentKey: string };
  /** Acquire the existing continuation owner before any queue claim. */
  lockTurn?: (tx: CreditTransaction) => Promise<void>;
  /** Save the same final URLs in the existing continuation journal. */
  prepareSend?: (tx: CreditTransaction, reservation: VoiceReservation, urls: VoiceDispatchUrls) => Promise<VoiceDispatchUrls>;
};

function recipientUrls(conferenceId: string, reservationId: string) {
  const voice = new URL(`/api/auto-dial/${encodeURIComponent(conferenceId)}`, env.BASE_URL());
  const status = new URL("/api/auto-dial/status", env.BASE_URL());
  for (const url of [voice, status]) url.searchParams.set(VOICE_RESERVATION_QUERY_PARAM, reservationId);
  return { voiceUrl: voice.href, statusCallback: status.href };
}

/** A funding refusal rolls the claim back; events publish only after commit. */
export async function admitPredictiveVoiceRecipient(input: PredictiveVoiceAdmissionInput) {
  const publish: Array<() => Promise<void>> = [];
  let result: Awaited<ReturnType<typeof admitInTransaction>>;
  try { result = await db.transaction((tx) => admitInTransaction(tx, input, publish)); }
  catch (error) {
    if (error instanceof AdmissionRollback) return error.result;
    throw error;
  }
  for (const emit of publish) {
    try { await emit(); } catch (error) { logger.error("predictive.queue_event_failed", error); }
  }
  return result;
}

async function admitInTransaction(tx: CreditTransaction, input: PredictiveVoiceAdmissionInput, publish: Array<() => Promise<void>>) {
  const [balance] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, input.workspaceId)).for("no key update");
  if (!balance) return { ok: false, reason: "workspace_not_found" } as const;
  if (input.setup) {
    const replay = await repeatedConferenceStart(tx, input, input.setup);
    if (replay) return replay;
  }
  const tdb = createTenantDb(input.workspaceId, tx);
  const savedCampaign = await tdb.campaign.findFirst({ where: eq(campaign.id, input.campaignId) });
  if (!savedCampaign) return { ok: false, reason: "campaign_not_found" } as const;
  if (["paused", "waiting"].includes(savedCampaign.status ?? "") || !checkSchedule(savedCampaign)) {
    return { ok: false, reason: "campaign_deferred" } as const;
  }
  if (savedCampaign.status !== "running") return { ok: false, reason: "campaign_stopped" } as const;
  await input.lockTurn?.(tx);
  const deferEmit = (emit: () => Promise<void>) => { publish.push(emit); };
  let outsideWindow = false;
  const deferredClaims: Array<{ id: number; generation: string }> = [];
  try {
  for (let skipped = 0; skipped < 25; skipped++) {
    const contact = await claimNextQueueContact(tdb, input.campaignId, input.userId, { deferEmit });
    if (!contact) {
      const pending = await tdb.campaign_queue.count({ where: and(eq(campaign_queue.campaign_id, input.campaignId),
        isNull(campaign_queue.dequeued_at), or(isNull(campaign_queue.queue_state), eq(campaign_queue.queue_state, "queued"), eq(campaign_queue.queue_state, "assigned"))) });
      return { ok: false, reason: outsideWindow ? "outside_window" : pending ? "queue_pending" : "queue_empty" } as const;
    }
    const queue = await tdb.campaign_queue.findFirst({ where: eq(campaign_queue.id, contact.queue_id) });
    if (!queue || queue.assigned_to_user_id !== input.userId) return { ok: false, reason: "queue_pending" } as const;
    if (!recipientCallingWindowStatus(contact.contact_phone).allowed) {
      outsideWindow = true;
      // Keep this claim until selection ends so the RPC can reach the next
      // contact. Release it in the same transaction before any events publish.
      deferredClaims.push({ id: queue.id, generation: queue.dispatch_generation });
      continue;
    }
    return fundClaimedRecipient(tx, input, contact, queue);
  }
  return { ok: false, reason: "outside_window" } as const satisfies PredictiveRefusal;
  } finally {
    for (const claim of deferredClaims) await requeueCampaignQueueById(claim.id, input.workspaceId, { exec: tx, deferEmit,
      expectedGeneration: claim.generation, userId: input.userId });
  }
}

async function fundClaimedRecipient(
  tx: CreditTransaction, input: PredictiveVoiceAdmissionInput,
  contact: NonNullable<Awaited<ReturnType<typeof claimNextQueueContact>>>, queue: typeof campaign_queue.$inferSelect,
) {
    const tdb = createTenantDb(input.workspaceId, tx);
    const to = normalizePhoneNumber(contact.contact_phone), from = normalizePhoneNumber(contact.caller_id);
    const refusal = callerIdRefusalMessage(await resolveCallerIdUsability(input.workspaceId, from, { tdb }));
    if (refusal) throw new AdmissionRollback({ ok: false, reason: "caller_id_unavailable", message: refusal });
    if (input.setup && input.setup.callerId !== from) throw new AdmissionRollback({ ok: false, reason: "caller_id_unavailable", message: "Caller ID does not match this campaign" });
    const admitted = await reserveVoiceCreditsInTransaction(tx, { workspaceId: input.workspaceId, accountSid: input.accountSid,
      kind: "staffed", to, from, campaignId: input.campaignId, contactId: contact.contact_id, queueId: contact.queue_id,
      expectedQueueGeneration: queue.dispatch_generation, userId: input.userId, conferenceId: input.conferenceId,
      setupTo: input.setup?.to,
      predictiveOperationId: input.operationId, operationKey: input.setup?.intentKey ?? (input.operationId ? `predictive-operation:${input.operationId}` : `predictive-queue:${contact.queue_id}`),
      prepareOutreach: (ownedTx) => rpcCreateOutreachAttempt(ownedTx, { queueId: contact.queue_id, contactId: contact.contact_id,
        campaignId: input.campaignId, workspaceId: input.workspaceId, userId: input.userId }),
    });
    if (!admitted.ok) throw new AdmissionRollback(admitted);
    const initialUrls = recipientUrls(input.conferenceId, admitted.reservation.id);
    const urls = await input.prepareSend?.(tx, admitted.reservation, initialUrls) ?? initialUrls;
    for (const value of [urls.voiceUrl, urls.statusCallback]) {
      const ids = new URL(value).searchParams.getAll(VOICE_RESERVATION_QUERY_PARAM);
      if (ids.length !== 1 || ids[0] !== admitted.reservation.id) throw new Error("Predictive callback URLs lost funding identity");
    }
    const reservation = input.setup ? await startVoiceBridgeReservationInTransaction(tx, admitted.reservation, {
      voiceUrl: voiceBridgeUrl(urls.voiceUrl, admitted.reservation.id, "setup"),
      statusCallback: voiceBridgeUrl(urls.statusCallback, admitted.reservation.id, "setup"),
      recipientVoiceUrl: urls.voiceUrl, recipientStatusCallback: urls.statusCallback,
    }) : await startVoiceReservationInTransaction(tx, admitted.reservation, urls);
    return { ok: true, reservation, urls, contact } as const;
}

type ConferenceStartIdentity = Pick<PredictiveVoiceAdmissionInput, "workspaceId" | "campaignId" | "userId" | "conferenceId"> & {
  accountSid?: string; setup: NonNullable<PredictiveVoiceAdmissionInput["setup"]>;
};

/** The action has already authorized the workspace and selected agent. */
export async function replayPredictiveConferenceStart(input: ConferenceStartIdentity) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, input.workspaceId)).for("no key update");
    return repeatedConferenceStart(tx, input, input.setup);
  });
}

async function repeatedConferenceStart(tx: CreditTransaction, input: Omit<ConferenceStartIdentity, "setup">, setup: ConferenceStartIdentity["setup"]) {
  const [existing] = await tx.select().from(reservations).where(and(
    eq(reservations.workspace, input.workspaceId), eq(reservations.operation_key, setup.intentKey),
  )).limit(1);
  if (!existing || existing.state === "released" && !existing.setup_sid) return null;
  if (existing.conference_id !== input.conferenceId || existing.user_id !== input.userId || existing.campaign_id !== input.campaignId ||
      existing.setup_to !== setup.to || existing.caller_id !== setup.callerId || input.accountSid !== undefined && existing.account_sid !== input.accountSid || !existing.setup_sid) {
    return { ok: false, reason: "dispatch_in_progress" } as const;
  }
  return { ok: false, reason: "already_dispatched", callSid: existing.setup_sid, queueGeneration: existing.queue_generation } as const;
}
