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
import { isDispatchAllowedAt, nextDispatchOpenAt, smsSendPolicy } from "@/lib/campaign-dispatch-policy";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { getOrLookupLineType, isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { OUTBOUND_CREDIT_FLOOR } from "../../shared/credit-floor";
import { estimateMessageCredits } from "../../shared/pricing";
import { rpcFailExhaustedCampaignQueueContacts } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { QUERY_POOL_MAX } from "@/server/db-pool-size";
import { createSemaphore, type Semaphore } from "@/lib/semaphore";
import { selectEligibleCampaignQueueMembers } from "@/lib/campaign-dispatch-queue.server";
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

export type CampaignSmsDispatchCounts = {
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

export type CampaignSmsBatchOutcome =
  | { kind: "insufficient_credits" }
  | { kind: "caller_id_required" }
  | {
      kind: "deferred_send_window";
      nextOpenAt: Date;
      /** Results from contacts that completed before a later contact hit the window boundary. */
      responses: ContactDispatchResult[];
      /** Aggregate work completed before the batch deferred. */
      progress: { counts: CampaignSmsDispatchCounts; queuedRemaining: number };
    }
  | {
      kind: "dispatched";
      responses: ContactDispatchResult[];
      counts: CampaignSmsDispatchCounts;
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
  const sendPolicy = smsSendPolicy(campaign.campaign);
  if (!isDispatchAllowedAt(sendPolicy)) {
    return {
      kind: "deferred_send_window",
      // Defensive fallback: a parsed window with active intervals always has
      // an open instant within the week, but never hot-loop if that invariant
      // is somehow violated.
      nextOpenAt:
        nextDispatchOpenAt(sendPolicy) ?? new Date(Date.now() + 15 * 60 * 1000),
      responses: [],
      progress: {
        counts: {
          sent: 0,
          failed: 0,
          dequeued: 0,
          deferred: 0,
          unaffordable: 0,
          exhausted: 0,
        },
        queuedRemaining: audience?.length ?? 0,
      },
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
  const queueSelection = selectEligibleCampaignQueueMembers(allQueued, maxContacts);
  const queueMembers = queueSelection.selected;

  const responses: ContactDispatchResult[] = [];
  const counts = {
    sent: 0,
    failed: 0,
    dequeued: 0,
    deferred: queueSelection.deferredCount,
    unaffordable: 0,
    exhausted: 0,
  };
  const budget = createDispatchCreditBudget(credits.balance);

  // Start-rate cap: keep provider requests under `configuredDispatcherSmsMps`.
  // We pace *request starts*, not completions — Twilio's throttle is on new
  // sends per second, not on in-flight requests. Legacy pipelines default to
  // 2 MPS (500ms between starts); parallel-on portals use their configured
  // target.
  const startRateMps = configuredDispatcherSmsMps(portalConfig);
  const minStartIntervalMs = 1000 / Math.max(startRateMps, 0.1);
  // The cap is enforced against the pacer below, at the moment each request is
  // issued. It spans the whole queue, so adjacent batches cannot restart it.
  const startPacer = createStartPacer(minStartIntervalMs);
  // A batch claims up to MAX_CONCURRENCY rows and prepares them at the same
  // time (#2185). Every preparation step is a database round trip, so without
  // a bound a 25-row batch queues a ten-connection pool to capacity and the
  // web app, the admin client and /readyz all wait behind it — one pool serves
  // the whole process. Half the pool leaves the other consumers headroom.
  const prepSemaphore = createSemaphore(Math.ceil(QUERY_POOL_MAX / 2));

  // Same-number rows wait for the first row's send result. A reservation set
  // alone can dequeue a sibling while the first row is still preparing and
  // later defers at the campaign-window boundary.
  const claimedNumbers = new Map<string, SmsPhoneClaim>();

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
    sendPolicy,
    startPacer,
    prepSemaphore,
  };

  const deferredAt = await runPacedSendBatches({
    queueMembers,
    ctx,
    batchSize: BATCH_SIZE,
    startPacer,
    responses,
  });
  if (counts.failed > 0) {
    counts.exhausted = await rpcFailExhaustedCampaignQueueContacts(
      createTenantDb(workspaceId),
      Number(campaignId),
    );
  }
  const queuedRemaining = Math.max(
    0,
    queueSelection.unselectedEligibleCount +
      counts.deferred +
      counts.failed +
      counts.unaffordable -
      counts.exhausted,
  );
  if (deferredAt) {
    return {
      kind: "deferred_send_window",
      nextOpenAt: deferredAt,
      responses,
      progress: { counts, queuedRemaining },
    };
  }

  return {
    kind: "dispatched",
    responses,
    counts,
    queuedRemaining,
    creditsExhausted: counts.unaffordable > 0 && budget.exhausted,
  };
}

/**
 * Serialises provider-request starts at a fixed minimum interval.
 *
 * The interval must be measured between *requests*, not between the dispatch
 * calls that begin a row's preparation. A dispatched row does async work before
 * the provider is called — line-type lookup, duplicate check, opt-out
 * dequeue — and that work differs per row, so a dispatch-stamped clock drifts
 * from the request clock by exactly the per-row difference. Rows then bunch up:
 * a slow row's request can overtake a faster row's that was dispatched after
 * it, and under load the gap collapses to nothing, which is the one situation
 * where the rate limit matters.
 *
 * Callers queue here immediately before issuing their request, so each row
 * claims a slot in the order it actually reaches the provider.
 */
function createStartPacer(minStartIntervalMs: number): StartPacer {
  let lastRequestAt: number | null = null;
  // Chains the turns so two rows finishing their preparation in the same tick
  // cannot both read the same `lastRequestAt` and pass the gate together.
  let turn: Promise<void> = Promise.resolve();
  return {
    async waitForTurn() {
      const mine = turn.then(async () => {
        if (lastRequestAt !== null) {
          const waitMs = Math.max(0, minStartIntervalMs - (Date.now() - lastRequestAt));
          if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
        // Stamped here, at the release of the turn: the request follows
        // immediately with no intervening await.
        lastRequestAt = Date.now();
      });
      // Keep the chain usable after a rejected turn so one failed row cannot
      // wedge every later row's pacing.
      turn = mine.then(
        () => undefined,
        () => undefined,
      );
      return mine;
    },
  };
}

/**
 * Start each batch's sends at the paced rate and collect the results in
 * queue order per batch.
 *
 * Pacing lives in the pacer rather than in this loop, so a batch dispatches
 * without serialising on timers. Per-row preparation then overlaps, and the
 * rate is applied where the provider is actually called.
 */
async function runPacedSendBatches(args: {
  queueMembers: QueueMember[];
  ctx: HandleMemberCtx;
  batchSize: number;
  startPacer: StartPacer;
  responses: ContactDispatchResult[];
}): Promise<Date | null> {
  const { queueMembers, ctx, batchSize, startPacer, responses } = args;
  for (let i = 0; i < queueMembers.length; i += batchSize) {
    const batch = queueMembers.slice(i, i + batchSize);
    const startingPromises: Promise<HandleMemberResult>[] = [];
    for (const member of batch) {
      // Once a row has been refused for credits, later rows cannot afford a
      // send either: account for them without lookups or pacing waits.
      if (ctx.counts.unaffordable > 0 && ctx.budget.exhausted) {
        responses.push(skipForInsufficientCredits(member, ctx.counts));
        continue;
      }

      startingPromises.push(handleMember(member, ctx));
    }
    const batchResults = await Promise.all(startingPromises);
    const deferredAt = batchResults.find((result) => result.deferredSendWindow)?.deferredSendWindow;
    responses.push(
      ...batchResults
        .filter((result) => !result.deferredSendWindow)
        .map((result) => result.response),
    );
    if (deferredAt) return deferredAt;
  }
  return null;
}

type DispatchCounts = CampaignSmsDispatchCounts;

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
  claimedNumbers: Map<string, SmsPhoneClaim>;
  budget: DispatchCreditBudget;
  sendPolicy: ReturnType<typeof smsSendPolicy>;
  startPacer: StartPacer;
  prepSemaphore: Semaphore;
};

/** Claims the next provider-request slot at the configured start rate. */
type StartPacer = {
  waitForTurn: () => Promise<void>;
};

type HandleMemberResult = {
  response: ContactDispatchResult;
  deferredSendWindow?: Date;
};

type SmsPhoneClaimResult =
  | { kind: "handled" }
  | { kind: "unaffordable" }
  | { kind: "deferred_send_window"; nextOpenAt: Date };

type SmsPhoneClaim = {
  result: Promise<SmsPhoneClaimResult>;
  resolve: (result: SmsPhoneClaimResult) => void;
};

function createSmsPhoneClaim(): SmsPhoneClaim {
  let resolve!: (result: SmsPhoneClaimResult) => void;
  const result = new Promise<SmsPhoneClaimResult>((resolveResult) => {
    resolve = resolveResult;
  });
  return { result, resolve };
}

function memberResponse(response: ContactDispatchResult): HandleMemberResult {
  return { response };
}

function deferredSendWindowResponse(policy: ReturnType<typeof smsSendPolicy>): HandleMemberResult {
  return {
    response: {},
    deferredSendWindow:
      nextDispatchOpenAt(policy) ?? new Date(Date.now() + 15 * 60 * 1000),
  };
}

async function handleMember(
  member: QueueMember,
  ctx: HandleMemberCtx,
): Promise<HandleMemberResult> {
  const { counts, claimedNumbers, workspaceId, campaignId, userId } = ctx;
  const normalizedPhone = normalizePhoneNumber(member.contact?.phone || "");

  // Recipient-local quiet hours (CASL/TCPA — 8am–9pm recipient time).
  // Unlike opt-out/landline/duplicate below, this is temporary: leave the
  // row queued (no dequeue) so a later in-window dispatch picks it up.
  const windowStatus = recipientCallingWindowStatus(normalizedPhone);
  if (!windowStatus.allowed) {
    counts.deferred += 1;
    return memberResponse({
      [member.contact_id]: {
        success: true,
        skipped: true,
        deferred: true,
        reason: "Outside recipient quiet-hours window",
      },
    });
  }

  if (member.contact?.opt_out) {
    await withPrepPermit(ctx, () =>
      dequeueQueueEntry({
        by: { id: member.id },
        userId,
        reason: OPTED_OUT_SMS_DEQUEUED_REASON,
      }),
    );
    counts.dequeued += 1;
    return memberResponse({
      [member.contact_id]: {
        success: true,
        skipped: true,
        reason: OPTED_OUT_SMS_DEQUEUED_REASON,
      },
    });
  }

  let phoneClaim: SmsPhoneClaim | null = null;
  if (normalizedPhone) {
    const existingClaim = claimedNumbers.get(normalizedPhone);
    if (existingClaim) {
      const firstResult = await existingClaim.result;
      if (firstResult.kind === "deferred_send_window") {
        counts.deferred += 1;
        return { response: {}, deferredSendWindow: firstResult.nextOpenAt };
      }
      if (firstResult.kind === "unaffordable") {
        return memberResponse(skipForInsufficientCredits(member, counts));
      }
      await withPrepPermit(ctx, () =>
        dequeueQueueEntry({
          by: { id: member.id },
          userId,
          reason: DUPLICATE_SMS_DEQUEUED_REASON,
        }),
      );
      counts.dequeued += 1;
      return memberResponse({
        [member.contact_id]: {
          success: true,
          skipped: true,
          reason: DUPLICATE_SMS_DEQUEUED_REASON,
        },
      });
    }
    phoneClaim = createSmsPhoneClaim();
    claimedNumbers.set(normalizedPhone, phoneClaim);
  }

  return handleClaimedMember(member, ctx, normalizedPhone, phoneClaim).then(
    (result) => {
      phoneClaim?.resolve(
        result.deferredSendWindow
          ? { kind: "deferred_send_window", nextOpenAt: result.deferredSendWindow }
          : { kind: "handled" },
      );
      return result;
    },
    (error: unknown) => {
      phoneClaim?.resolve({ kind: "handled" });
      throw error;
    },
  );
}

/** Runs `work` holding one preparation permit. */
async function withPrepPermit<T>(ctx: HandleMemberCtx, work: () => Promise<T>): Promise<T> {
  const release = await ctx.prepSemaphore.acquire();
  try {
    return await work();
  } finally {
    release();
  }
}

/** A prepared row is ready to send, or it is already finished for some reason. */
type PreparedRow =
  | { kind: "finished"; result: HandleMemberResult }
  | { kind: "ready"; processedBody: string; cost: number };

/**
 * Everything a row needs before it may send: the lookups, the duplicate check,
 * the template, and the credit reservation. Every statement here is a
 * database round trip, which is why it runs under a preparation permit.
 *
 * Split from the send so the permit is released before the pacing wait, which
 * can be seconds at a low configured rate. Holding a permit across that wait
 * would gate the pool on the rate limit rather than on database work.
 */
async function prepareClaimedMember(
  member: QueueMember,
  ctx: HandleMemberCtx,
  normalizedPhone: string,
  phoneClaim: SmsPhoneClaim | null,
): Promise<PreparedRow> {
  const { counts, workspaceId, campaignId, userId } = ctx;
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
      kind: "finished",
      result: memberResponse({
        [member.contact_id]: {
          success: true,
          skipped: true,
          reason: LANDLINE_SMS_DEQUEUED_REASON,
        },
      }),
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
      kind: "finished",
      result: memberResponse({
        [member.contact_id]: {
          success: true,
          skipped: true,
          reason: DUPLICATE_SMS_DEQUEUED_REASON,
        },
      }),
    };
  }

  let processedBody = ctx.campaign.body_text;
  if (member.contact && ctx.campaign.body_text) {
    processedBody = processTemplateTags(ctx.campaign.body_text, member.contact);
  }

  // Reserve with no await between the estimate and the reservation, so sibling
  // rows in this batch cannot spend the same credits.
  const cost = estimateMessageCredits({
    body: processedBody ?? "",
    hasMedia: ctx.media.length > 0,
  }).credits;
  if (!ctx.budget.reserve(cost)) {
    phoneClaim?.resolve({ kind: "unaffordable" });
    return {
      kind: "finished",
      result: memberResponse(skipForInsufficientCredits(member, counts)),
    };
  }

  return { kind: "ready", processedBody, cost };
}

async function handleClaimedMember(
  member: QueueMember,
  ctx: HandleMemberCtx,
  normalizedPhone: string,
  phoneClaim: SmsPhoneClaim | null,
): Promise<HandleMemberResult> {
  const { counts, workspaceId, campaignId, userId } = ctx;

  const prepared = await withPrepPermit(ctx, () =>
    prepareClaimedMember(member, ctx, normalizedPhone, phoneClaim),
  );
  if (prepared.kind === "finished") return prepared.result;
  const { processedBody, cost } = prepared;

  // Claim a provider-request slot. This is the rate limit, so it is applied
  // here rather than at dispatch: the interval has to be measured between the
  // requests the provider actually receives. It is also an await, so it can
  // hold a row past the window boundary — hence the gate order below.
  await ctx.startPacer.waitForTurn();

  // The initial gate protects an idle batch, but pacing and the per-contact
  // lookup gates can keep a row here long enough for the campaign window to
  // close. Check again immediately before starting the provider call so rows
  // that have not started remain queued for the next window.
  if (!isDispatchAllowedAt(ctx.sendPolicy)) {
    ctx.budget.release(cost);
    counts.deferred += 1;
    return deferredSendWindowResponse(ctx.sendPolicy);
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
    sendPolicy: ctx.sendPolicy,
    campaignSmsRow: ctx.campaign.campaign,
  }).then(
    (result) => {
      if (result.kind === "deferred_send_window") {
        ctx.budget.release(cost);
        counts.deferred += 1;
        return { response: {}, deferredSendWindow: result.nextOpenAt };
      }
      counts.sent += 1;
      return memberResponse({ [member.contact_id]: { success: true, ...result } });
    },
    async (error) => {
      ctx.budget.release(cost);
      const message = error instanceof Error ? error.message : String(error);
      counts.failed += 1;
      await recordQueueAttemptFailure({ queueId: member.id, error: message, workspaceId });
      return memberResponse({ [member.contact_id]: { success: false, error: message } });
    },
  );
}
