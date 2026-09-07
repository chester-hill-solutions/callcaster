/**
 * Campaign SMS batch dispatch: the single authoritative send loop.
 *
 * Owns every send gate — credits, caller-id requirement, campaign send
 * window, recipient quiet hours, opt-out, line type, duplicates, template
 * tags, MMS media, portal/Messaging Service resolution — and returns
 * structured outcomes so callers stay thin adapters:
 *
 * - `/api/sms` (HTTP adapter): auth/capability/parse, maps outcomes to
 *   the existing response contract.
 * - worker `campaign_dispatch` handler (durable adapter): claim/successor/
 *   completion orchestration around bounded batches.
 */
import {
  messageCampaignRequiresCallerId,
} from "@/lib/sms-send-resolve";
import { dequeueQueueEntry, recordQueueAttemptFailure } from "@/lib/campaign-queue-db.server";
import { loadCampaignSmsDispatchData } from "@/lib/sms-campaign-db.server";
import { getCampaignQueueById } from "@/lib/database/campaign.server";
import { getWorkspaceTwilioPortalConfig } from "@/lib/database/workspace.server";
import { normalizePhoneNumber, processTemplateTags } from "@/lib/utils";
import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
} from "@/lib/throughput-config.server";
import { isWithinSendWindow, nextSendWindowOpenAt, parseSendWindow } from "@/lib/campaign-send-window";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { OUTBOUND_CREDIT_FLOOR } from "../../shared/credit-floor";
import { estimateMessageCredits } from "../../shared/pricing";
import { rpcFailExhaustedCampaignQueueContacts } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import type { TwilioMessageIntent } from "@/lib/types";
import {
  sendSingleCampaignSms,
  hasDuplicateCampaignSms,
  OPTED_OUT_SMS_DEQUEUED_REASON,
  LANDLINE_SMS_DEQUEUED_REASON,
  DUPLICATE_SMS_DEQUEUED_REASON,
} from "@/lib/campaign-sms-send.server";

export type ContactDispatchResult = Record<
  string | number,
  {
    success: boolean;
    skipped?: boolean;
    deferred?: boolean;
    reason?: string;
    error?: string;
    [key: string]: unknown;
  }
>;

export type CampaignSmsBatchOutcome =
  | { kind: "insufficient_credits" }
  | { kind: "caller_id_required" }
  | { kind: "deferred_send_window"; nextOpenAt: Date }
  | {
      kind: "dispatched";
      responses: ContactDispatchResult[];
      counts: {
        sent: number;
        failed: number;
        /** Dequeued without a send: opt-out, landline, duplicate. */
        dequeued: number;
        /** Left queued for a later tick (recipient quiet hours). */
        deferred: number;
        /** Left queued because the remaining balance could not cover the estimated cost. */
        unaffordable: number;
        /** Dead-lettered by the exhaustion sweep: failed rows at the attempt maximum. */
        exhausted: number;
      };
      /**
       * Rows still queued after this batch: quiet-hours deferrals, failed
       * sends that still have attempts left, unaffordable rows, and contacts
       * beyond `maxContacts`.
       */
      queuedRemaining: number;
      /**
       * The balance ran out part-way through the batch and cannot cover
       * another send: adapters treat this like the entry-level
       * `insufficient_credits` outcome instead of scheduling a successor.
       */
      creditsExhausted: boolean;
    };

/** Skip reason for a row left queued because the balance cannot cover its estimated cost. */
export const INSUFFICIENT_CREDITS_SKIPPED_REASON = "Insufficient credits for the estimated message cost";

/**
 * Per-dispatch credit budget. The entry gate reads the balance once, but
 * debits land asynchronously after delivery, so every send in the batch
 * would otherwise pass on the same stale balance. Reservations are made
 * synchronously right before a send starts (no await in between), so
 * concurrent rows in one dispatch call cannot spend the same credits.
 * Cross-worker reservation is #1271.
 */
export function createDispatchCreditBudget(balance: number) {
  let remaining = balance - OUTBOUND_CREDIT_FLOOR;
  let cheapestSeen = Number.POSITIVE_INFINITY;
  return {
    reserve(cost: number): boolean {
      cheapestSeen = Math.min(cheapestSeen, cost);
      if (cost > remaining) return false;
      remaining -= cost;
      return true;
    },
    /** A send that never reached Twilio will not be debited: give the credits back. */
    release(cost: number): void {
      remaining += cost;
    },
    /** True when a row was refused and the balance still cannot cover the cheapest one seen. */
    get exhausted(): boolean {
      return remaining < cheapestSeen;
    },
  };
}

export type DispatchCreditBudget = ReturnType<typeof createDispatchCreditBudget>;

export async function dispatchCampaignSmsBatch(args: {
  workspaceId: string;
  campaignId: string;
  /** Authenticated actor attributed on dequeues and outreach attempts. */
  userId: string;
  /** Explicit caller-id override (route request body); falls back to campaign. */
  callerId?: string | null;
  /**
   * Public-API contract (`/api/sms`): when the campaign's send mode requires
   * a from number, the request must supply `callerId` explicitly — the
   * campaign's stored caller-id does not satisfy the gate (it still feeds
   * the `from` fallback). Worker dispatch omits this and uses the campaign's
   * configured caller-id.
   */
  requireExplicitCallerId?: boolean;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSidFromRequest?: string | null;
  /** Bound the number of queue rows processed this call (worker batches). */
  maxContacts?: number;
}): Promise<CampaignSmsBatchOutcome> {
  const {
    workspaceId,
    campaignId,
    userId,
    messageIntent = null,
    messagingServiceSidFromRequest = null,
    maxContacts,
  } = args;
  const callerIdStr = typeof args.callerId === "string" ? args.callerId.trim() : "";

  // Fail-closed credit gate: check once at entry for the whole batch
  // rather than per contact, so a mid-campaign depletion doesn't burn
  // through the audience one Twilio failure at a time. Workspace existence
  // is validated by the caller (requireWorkspaceAccess / API-key match)
  // before this runs, so an unknown-workspace result folds into the same
  // "insufficient_credits" outcome rather than a new kind.
  const credits = await requireOutboundCredits(workspaceId);
  if (!credits.ok) {
    return { kind: "insufficient_credits" };
  }

  const [campaign, audience, portalConfig] = await Promise.all([
    loadCampaignSmsDispatchData(workspaceId, campaignId),
    getCampaignQueueById({ campaign_id: campaignId, onlyQueued: true }),
    getWorkspaceTwilioPortalConfig({ workspaceId }),
  ]);

  const requiresCallerId = messageCampaignRequiresCallerId(
    campaign.campaign?.sms_send_mode,
  );
  const effectiveCallerId =
    callerIdStr || String(campaign.campaign?.caller_id ?? "").trim();
  const callerIdForGate = args.requireExplicitCallerId ? callerIdStr : effectiveCallerId;
  if (requiresCallerId && !callerIdForGate) {
    return { kind: "caller_id_required" };
  }

  // Campaign send-window / CASL quiet-hours gate. This is the authoritative
  // campaign SMS path and is campaign-only — 1:1 chat sends use a different
  // route (chat_sms) and are never gated here. When the current tick falls
  // outside the campaign's send window we DEFER the whole batch: nothing is
  // dispatched and nothing is dequeued, so contacts remain queued for a
  // later in-window tick. A `null` window is unrestricted. The outcome
  // carries the exact next open so the durable adapter can schedule its
  // successor at the window boundary instead of a fixed poll interval.
  const sendWindow = parseSendWindow(campaign.campaign?.sms_send_window ?? null);
  if (!isWithinSendWindow(sendWindow)) {
    return {
      kind: "deferred_send_window",
      // Defensive fallback: a parsed window with active intervals always has
      // an open instant within the week, but never hot-loop if that invariant
      // is somehow violated.
      nextOpenAt:
        nextSendWindowOpenAt(sendWindow) ?? new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  const media = campaign.message_media?.length
    ? await Promise.all(
        campaign.message_media.map(mediaItem =>
          createSignedObjectUrl("messageMedia", `${workspaceId}/${mediaItem}`, 3600)
        )
      )
    : [];

  // When parallel dispatch is enabled, cap batch concurrency using portal
  // throughput settings.
  const MAX_CONCURRENCY = 25;
  const BATCH_SIZE = portalConfig.parallelDispatchEnabled
    ? Math.min(
        MAX_CONCURRENCY,
        claimBatchSizeForRate(
          configuredDispatcherSmsMps(portalConfig),
          1000,
        ),
      )
    : MAX_CONCURRENCY;

  const allQueued = audience ?? [];
  const queueMembers =
    typeof maxContacts === "number" ? allQueued.slice(0, maxContacts) : allQueued;

  const responses: ContactDispatchResult[] = [];
  const counts = { sent: 0, failed: 0, dequeued: 0, deferred: 0, unaffordable: 0, exhausted: 0 };
  const budget = createDispatchCreditBudget(credits.balance);

  // Start-rate cap: keep dispatch-loop starts under `configuredDispatcherSmsMps`.
  // We pace *starts*, not completions — Twilio's throttle is on new sends per
  // second, not on in-flight requests. Legacy pipelines default to 2 MPS
  // (500ms between starts); parallel-on portals use their configured target.
  const startRateMps = configuredDispatcherSmsMps(portalConfig);
  const minStartIntervalMs = 1000 / Math.max(startRateMps, 0.1);

  // In-batch normalized-number reservation. `hasDuplicateCampaignSms` reads
  // persisted history and cannot see other rows still executing in this same
  // Promise.all batch — two queue entries for the same phone would both pass
  // its check and both send. Reserve the number synchronously before the
  // first `await` so the second occurrence sees the reservation and dequeues
  // as a duplicate. Reservation lives for the whole dispatch call so pacing
  // gaps within one call still deduplicate.
  const claimedNumbers = new Set<string>();

  const ctx: HandleMemberCtx = {
    workspaceId,
    campaignId,
    userId,
    media: media.filter(Boolean) as string[],
    effectiveCallerId,
    portalConfig,
    messageIntent,
    messagingServiceSidFromRequest,
    campaign,
    counts,
    claimedNumbers,
    budget,
  };

  await runPacedSendBatches({ queueMembers, ctx, batchSize: BATCH_SIZE, minStartIntervalMs, responses });

  // Rows that failed for the last time are dead-lettered now so a bad number
  // cannot pin the chain to retries forever (#1513). Exhausted rows may also
  // include failures from earlier ticks, so clamp the remaining count.
  if (counts.failed > 0) {
    counts.exhausted = await rpcFailExhaustedCampaignQueueContacts(
      createTenantDb(workspaceId),
      Number(campaignId),
    );
  }

  const truncated = allQueued.length - queueMembers.length;
  return {
    kind: "dispatched",
    responses,
    counts,
    queuedRemaining: Math.max(
      0,
      truncated + counts.deferred + counts.failed + counts.unaffordable - counts.exhausted,
    ),
    creditsExhausted: counts.unaffordable > 0 && budget.exhausted,
  };
}

/**
 * Start each batch's sends at the paced rate and collect the results in
 * queue order per batch.
 */
async function runPacedSendBatches(args: {
  queueMembers: QueueMember[];
  ctx: HandleMemberCtx;
  batchSize: number;
  minStartIntervalMs: number;
  responses: ContactDispatchResult[];
}): Promise<void> {
  const { queueMembers, ctx, batchSize, minStartIntervalMs, responses } = args;
  for (let i = 0; i < queueMembers.length; i += batchSize) {
    const batch = queueMembers.slice(i, i + batchSize);
    const startingPromises: Promise<ContactDispatchResult>[] = [];
    for (const [j, member] of batch.entries()) {
      // Once a row has been refused for credits, later rows cannot afford a
      // send either: account for them without lookups or pacing waits.
      if (ctx.counts.unaffordable > 0 && ctx.budget.exhausted) {
        responses.push(skipForInsufficientCredits(member, ctx.counts));
        continue;
      }
      startingPromises.push(handleMember(member, ctx));
      // Pause between starts but not after the final one: no reason to
      // waste a full interval waiting for nothing.
      if (j < batch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, minStartIntervalMs));
      }
    }
    const batchResults = await Promise.all(startingPromises);
    responses.push(...batchResults);
  }
}

type DispatchCounts = {
  sent: number;
  failed: number;
  dequeued: number;
  deferred: number;
  unaffordable: number;
  exhausted: number;
};

/** The row stays queued; a relaunch after a top-up picks it up. */
function skipForInsufficientCredits(
  member: { contact_id: number },
  counts: DispatchCounts,
): ContactDispatchResult {
  counts.unaffordable += 1;
  return {
    [member.contact_id]: {
      success: false,
      skipped: true,
      reason: INSUFFICIENT_CREDITS_SKIPPED_REASON,
    },
  };
}

type QueueMember = NonNullable<
  Awaited<ReturnType<typeof getCampaignQueueById>>
>[number];

type CampaignData = Awaited<ReturnType<typeof loadCampaignSmsDispatchData>>;

type HandleMemberCtx = {
  workspaceId: string;
  campaignId: string;
  userId: string;
  media: string[];
  effectiveCallerId: string;
  portalConfig: Awaited<ReturnType<typeof getWorkspaceTwilioPortalConfig>>;
  messageIntent: TwilioMessageIntent | null;
  messagingServiceSidFromRequest: string | null;
  campaign: CampaignData;
  counts: DispatchCounts;
  claimedNumbers: Set<string>;
  budget: DispatchCreditBudget;
};

async function handleMember(
  member: QueueMember,
  ctx: HandleMemberCtx,
): Promise<ContactDispatchResult> {
  const { counts, claimedNumbers, workspaceId, campaignId, userId } = ctx;
  const normalizedPhone = normalizePhoneNumber(member.contact?.phone || "");

  // Recipient-local quiet hours (CASL/TCPA — 8am–9pm recipient time).
  // Unlike opt-out/landline/duplicate below, this is temporary: leave the
  // row queued (no dequeue) so a later in-window dispatch picks it up.
  const windowStatus = recipientCallingWindowStatus(normalizedPhone);
  if (!windowStatus.allowed) {
    counts.deferred += 1;
    return {
      [member.contact_id]: {
        success: true,
        skipped: true,
        deferred: true,
        reason: "Outside recipient quiet-hours window",
      },
    };
  }

  if (member.contact?.opt_out) {
    await dequeueQueueEntry({
      by: { id: member.id },
      userId,
      reason: OPTED_OUT_SMS_DEQUEUED_REASON,
    });
    counts.dequeued += 1;
    return {
      [member.contact_id]: {
        success: true,
        skipped: true,
        reason: OPTED_OUT_SMS_DEQUEUED_REASON,
      },
    };
  }

  // In-batch dedup — check + reserve BEFORE the first async gate so a
  // sibling row starting later in the same dispatch call sees the
  // reservation. Placed after opt_out so a persistent opt-out reason wins
  // over a transient in-batch reason on the same contact.
  if (normalizedPhone && claimedNumbers.has(normalizedPhone)) {
    await dequeueQueueEntry({
      by: { id: member.id },
      userId,
      reason: DUPLICATE_SMS_DEQUEUED_REASON,
    });
    counts.dequeued += 1;
    return {
      [member.contact_id]: {
        success: true,
        skipped: true,
        reason: DUPLICATE_SMS_DEQUEUED_REASON,
      },
    };
  }
  if (normalizedPhone) {
    claimedNumbers.add(normalizedPhone);
  }

  const lineType = member.contact
    ? await getOrLookupLineType({
        workspaceId,
        contactId: member.contact_id,
        phone: normalizedPhone,
      })
    : null;

  if (isSmsIncapableLineType(lineType)) {
    await dequeueQueueEntry({
      by: { id: member.id },
      userId,
      reason: LANDLINE_SMS_DEQUEUED_REASON,
    });
    counts.dequeued += 1;
    return {
      [member.contact_id]: {
        success: true,
        skipped: true,
        reason: LANDLINE_SMS_DEQUEUED_REASON,
      },
    };
  }

  const duplicateExists = await hasDuplicateCampaignSms({
    workspaceId,
    campaignId,
    to: normalizedPhone,
  });

  if (duplicateExists) {
    await dequeueQueueEntry({
      by: { id: member.id },
      userId,
      reason: DUPLICATE_SMS_DEQUEUED_REASON,
    });
    counts.dequeued += 1;
    return {
      [member.contact_id]: {
        success: true,
        skipped: true,
        reason: DUPLICATE_SMS_DEQUEUED_REASON,
      },
    };
  }

  let processedBody = ctx.campaign.body_text;
  if (member.contact && ctx.campaign.body_text) {
    processedBody = processTemplateTags(ctx.campaign.body_text, member.contact);
  }

  // Reserve synchronously (no await between the estimate and the send start)
  // so sibling rows in this batch cannot spend the same credits.
  const cost = estimateMessageCredits({
    body: processedBody ?? "",
    hasMedia: ctx.media.length > 0,
  }).credits;
  if (!ctx.budget.reserve(cost)) {
    return skipForInsufficientCredits(member, counts);
  }

  return sendSingleCampaignSms({
    body: processedBody,
    media: ctx.media,
    to: normalizedPhone,
    from: ctx.effectiveCallerId,
    campaign_id: campaignId,
    workspace: workspaceId,
    contact_id: member.contact_id,
    queue_id: member.id,
    user_id: userId,
    portalConfig: ctx.portalConfig,
    messageIntent: ctx.messageIntent,
    messagingServiceSidFromRequest: ctx.messagingServiceSidFromRequest,
    campaignSmsRow: ctx.campaign.campaign,
  }).then(
    (result) => {
      counts.sent += 1;
      return { [member.contact_id]: { success: true, ...result } };
    },
    async (error) => {
      ctx.budget.release(cost);
      const message = error instanceof Error ? error.message : String(error);
      counts.failed += 1;
      await recordQueueAttemptFailure({ queueId: member.id, error: message, workspaceId });
      return { [member.contact_id]: { success: false, error: message } };
    },
  );
}
