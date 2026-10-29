/**
 * Campaign IVR batch dispatch: the durable call loop for machine-dialled
 * voice campaigns (robocall, simple_ivr, complex_ivr).
 *
 * Mirrors `dispatchCampaignSmsBatch`'s gate structure and outcome contract so
 * the worker `campaign_dispatch` handler stays a thin claim/successor/
 * completion adapter around either medium:
 *
 * - credits: one fail-closed `requireOutboundCredits` check per batch
 * - schedule: campaign calling-hours gate defers the whole batch
 * - recipient window: per-row TCPA/CRTC 8am–9pm check defers the row
 * - pacing: claim size derives from the workspace's voice CPS so the
 *   successor chain dials at the configured rate, never flat-out
 *
 * Per-contact mechanics match the proven `/api/ivr` choke point exactly:
 * outreach attempt → Twilio `calls.create` (machine detection, IVR flow +
 * status callbacks) → call row → dequeue. The legacy one-shot
 * `/api/initiate-ivr` loop was never wired to the UI and is superseded by
 * this worker path (#1348).
 */
import type Twilio from "twilio";
import { eq } from "drizzle-orm";
import { outreach_attempt as outreachAttemptTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
} from "@/lib/database/workspace.server";
import { getCampaignQueueById } from "@/lib/database/campaign.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { dequeueQueueEntry, recordQueueAttemptFailure } from "@/lib/campaign-queue-db.server";
import {
  rpcCreateOutreachAttempt,
  rpcFailExhaustedCampaignQueueContacts,
} from "@/lib/db-rpc.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import {
  ivrDispatchPacing,
  DEFAULT_WORKER_POLL_INTERVAL_MS,
} from "@/lib/throughput-config.server";
import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { ivrMachineDetection } from "@/lib/ivr-machine-detection";
import { createStartPacer, type StartPacer } from "@/lib/campaign-dispatch-pacing.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { dispatchReservedVoiceCall, ivrQueueVoiceOperationKey, VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";
import { hasDuplicateCampaignCall } from "@/lib/telephony-db.server";
import { logger } from "@/lib/logger.server";
import {
  createPhoneClaim,
  selectEligibleCampaignQueueMembers,
  sweepExhaustedQueueContacts,
  type PhoneClaim,
} from "@/lib/campaign-dispatch-queue.server";
import {
  isDispatchAllowedAt,
  ivrCallingPolicy,
  nextDispatchOpenAt,
} from "@/lib/campaign-dispatch-policy";
import type { CampaignDeferralCause } from "@/lib/campaign-batch-outcome";
import { voiceBillingKindFromCampaignType, type VoiceBillingKind } from "@/lib/pricing";

export const IVR_CALL_DEQUEUED_REASON = "IVR dial dispatched";
export const OPTED_OUT_IVR_DEQUEUED_REASON = "Contact opted out";
export const DUPLICATE_IVR_DEQUEUED_REASON = "Duplicate IVR call prevented";
const IVR_WINDOW_RETRY_MS = 15 * 60 * 1000;

export type CampaignIvrDispatchCounts = {
  called: number;
  failed: number;
  /** Dead-lettered by the exhaustion sweep: failed rows at the attempt maximum. */
  exhausted: number;
  /** Dequeued without a call: opted out or duplicate. */
  dequeued: number;
  /** Left queued until calling, funding or provider recovery permits progress. */
  deferred: number;
};

export type CampaignIvrBatchOutcome =
  | { kind: "insufficient_credits" }
  | { kind: "caller_id_required" }
  | {
      // The shared `deferred` kind and cause, so one worker helper handles
      // both dispatchers' blocked outcomes. `CampaignDeferralCause` also allows
      // `workspace_not_ready`; this dispatcher has no compliance gate, so a
      // window deferral is the only way it defers.
      kind: "deferred";
      nextOpenAt: Date;
      progress?: { counts: CampaignIvrDispatchCounts; queuedRemaining: number };
    } & CampaignDeferralCause
  | {
      kind: "dispatched";
      nextBatchDelayMs: number;
      counts: CampaignIvrDispatchCounts;
      /**
       * Rows still queued after this batch: recipient-window deferrals,
       * failed calls (which stay queued), and contacts beyond the claim.
       */
      queuedRemaining: number;
      blocked?: "insufficient_credits" | "provider_recovery";
    };

export async function dispatchCampaignIvrBatch(args: {
  workspaceId: string;
  campaignId: string;
  /** Launching actor attributed on dequeues and outreach attempts. */
  userId: string;
  /** Hard cap on rows processed this call (worker tick pacing). */
  maxContacts?: number;
}): Promise<CampaignIvrBatchOutcome> {
  const { workspaceId, campaignId, userId } = args;

  // Fail-closed credit gate, once per batch — same rationale as SMS.
  const credits = await requireOutboundCredits(workspaceId);
  if (!credits.ok) {
    return { kind: "insufficient_credits" };
  }

  const campaign = await findCampaignInWorkspace(workspaceId, campaignId);
  if (!campaign) {
    throw new Error(`campaign_dispatch: campaign ${campaignId} not found`);
  }

  const callerId = String(campaign.caller_id ?? "").trim();
  if (!callerId) {
    return { kind: "caller_id_required" };
  }

  // Campaign calling-hours gate. Outside the configured schedule nothing is
  // dialled and nothing is dequeued; the successor chain retries later.
  const callingPolicy = ivrCallingPolicy(campaign);
  const initialDeferralAt = campaignWindowDeferralAt(callingPolicy);
  if (initialDeferralAt) {
    return {
      kind: "deferred",
      because: "send_window",
      nextOpenAt: initialDeferralAt,
    };
  }

  const portalConfig = await getWorkspaceTwilioPortalConfig({ workspaceId });
  const { batchSize: claimSize, minStartIntervalMs: nextBatchDelayMs } = ivrDispatchPacing(portalConfig);
  const idleDelayMs = Math.max(nextBatchDelayMs, DEFAULT_WORKER_POLL_INTERVAL_MS);
  const startPacer = createStartPacer(nextBatchDelayMs);

  const allQueued = await getCampaignQueueById({
    campaign_id: campaignId,
    onlyQueued: true,
  });
  const queueSelection = selectEligibleCampaignQueueMembers(
    allQueued,
    typeof args.maxContacts === "number" ? Math.min(args.maxContacts, claimSize) : claimSize,
  );
  const queueMembers = queueSelection.selected;

  if (queueMembers.length === 0) {
    return {
      kind: "dispatched",
      nextBatchDelayMs: idleDelayMs,
      counts: {
        called: 0,
        failed: 0,
        dequeued: 0,
        deferred: queueSelection.deferredCount,
        exhausted: 0,
      },
      queuedRemaining:
        queueSelection.deferredCount + queueSelection.unselectedEligibleCount,
    };
  }

  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  const ivrUrls = resolveIvrCallUrls(campaignId);
  const tdb = createTenantDb(workspaceId);

  const counts = {
    called: 0,
    failed: 0,
    dequeued: 0,
    deferred: queueSelection.deferredCount,
    exhausted: 0,
  };
  const state: CampaignIvrDispatchState = { counts, deferredAt: null, blocked: null };

  // A sibling row must wait until the first row either starts a provider call
  // or defers. Otherwise a window close during async preparation can leave the
  // first row queued but dequeue its same-number sibling as a duplicate.
  const claimedNumbers = new Map<string, IvrPhoneClaim>();

  // Prepare the CPS-derived batch concurrently; the shared pacer controls
  // actual provider request starts after each row's preparation.
  await Promise.all(
    queueMembers.map((member) =>
      dispatchIvrQueueMember(member, {
        workspaceId,
        campaignId,
        userId,
        callerId,
        startPacer,
        machineDetection: ivrMachineDetection(campaign),
        billingKind: voiceBillingKindFromCampaignType(campaign.type),
        ivrUrls,
        twilio,
        tdb,
        callingPolicy,
        state,
        claimedNumbers,
      }),
    ),
  );

  counts.exhausted = await sweepExhaustedQueueContacts(tdb, campaignId, counts.failed);

  const queuedRemaining = remainingIvrQueue(queueSelection, counts);
  if (state.deferredAt && !state.blocked) {
    return {
      kind: "deferred",
      because: "send_window",
      nextOpenAt: state.deferredAt,
      progress: { counts, queuedRemaining },
    };
  }
  const madeProgress = counts.called + counts.dequeued + counts.exhausted > 0;
  return {
    kind: "dispatched",
    nextBatchDelayMs: madeProgress ? nextBatchDelayMs : idleDelayMs,
    counts,
    queuedRemaining,
    ...(state.blocked ? { blocked: state.blocked } : {}),
  };
}

function campaignWindowNextOpenAt(policy: ReturnType<typeof ivrCallingPolicy>): Date {
  return nextDispatchOpenAt(policy) ?? new Date(Date.now() + IVR_WINDOW_RETRY_MS);
}

type CampaignIvrDispatchState = {
  counts: CampaignIvrDispatchCounts;
  deferredAt: Date | null;
  blocked: "insufficient_credits" | "provider_recovery" | null;
};

type IvrQueueMember = Awaited<ReturnType<typeof getCampaignQueueById>>[number];

type IvrQueueMemberContext = {
  workspaceId: string;
  campaignId: string;
  userId: string;
  callerId: string;
  startPacer: StartPacer;
  machineDetection: ReturnType<typeof ivrMachineDetection>;
  billingKind: VoiceBillingKind;
  ivrUrls: ReturnType<typeof resolveIvrCallUrls>;
  twilio: Twilio.Twilio;
  tdb: ReturnType<typeof createTenantDb>;
  callingPolicy: ReturnType<typeof ivrCallingPolicy>;
  state: CampaignIvrDispatchState;
  claimedNumbers: Map<string, IvrPhoneClaim>;
};

async function dispatchIvrQueueMember(
  member: IvrQueueMember,
  context: IvrQueueMemberContext,
): Promise<void> {
  const phone = normalizePhoneNumber(member.contact?.phone || "");
  const windowStatus = recipientCallingWindowStatus(phone);
  if (!windowStatus.allowed) {
    context.state.counts.deferred += 1;
    logger.info("campaign_ivr_dispatch.recipient_window_skip", {
      campaignId: context.campaignId,
      queueId: member.id,
      timezone: windowStatus.timezone,
      reason: windowStatus.reason,
    });
    return;
  }

  if (member.contact?.opt_out) {
    await dequeueQueueEntry({
      by: { id: member.id },
      userId: context.userId,
      workspaceId: context.workspaceId,
      reason: OPTED_OUT_IVR_DEQUEUED_REASON,
    });
    context.state.counts.dequeued += 1;
    return;
  }

  const phoneClaim = await reserveIvrPhone(member, phone, context);
  if (!phoneClaim.claimed) return;

  let duplicateExists: boolean;
  try {
    duplicateExists =
      phone.length > 0 &&
      (await hasDuplicateCampaignCall({
        workspaceId: context.workspaceId,
        campaignId: context.campaignId,
        to: phone,
        tdb: context.tdb,
      }));
  } catch (error) {
    phoneClaim.claim?.resolve("failed_before_provider");
    throw error;
  }

  if (duplicateExists) {
    phoneClaim.claim?.resolve("duplicate");
    await dequeueQueueEntry({
      by: { id: member.id },
      userId: context.userId,
      workspaceId: context.workspaceId,
      reason: DUPLICATE_IVR_DEQUEUED_REASON,
    });
    context.state.counts.dequeued += 1;
    return;
  }

  const memberDeferralAt = campaignWindowDeferralAt(context.callingPolicy);
  if (memberDeferralAt) {
    phoneClaim.claim?.resolve("campaign_window_closed");
    context.state.counts.deferred += 1;
    context.state.deferredAt ??= memberDeferralAt;
    return;
  }

  await createOutreachAttemptAndCall(member, phone, phoneClaim.claim, context);
}

async function reserveIvrPhone(
  member: IvrQueueMember,
  phone: string,
  context: IvrQueueMemberContext,
): Promise<{ claimed: true; claim: IvrPhoneClaim | null } | { claimed: false }> {
  if (!phone) return { claimed: true, claim: null };

  const existingClaim = context.claimedNumbers.get(phone);
  if (existingClaim) {
    const firstResult = await existingClaim.result;
    if (
      firstResult === "campaign_window_closed" ||
      firstResult === "recipient_window_closed" ||
      firstResult === "provider_pending" ||
      firstResult === "failed_before_provider"
    ) {
      context.state.counts.deferred += 1;
      if (firstResult === "campaign_window_closed") {
        context.state.deferredAt ??= campaignWindowNextOpenAt(context.callingPolicy);
      }
      return { claimed: false };
    }

    await dequeueQueueEntry({
      by: { id: member.id },
      userId: context.userId,
      workspaceId: context.workspaceId,
      reason: DUPLICATE_IVR_DEQUEUED_REASON,
    });
    context.state.counts.dequeued += 1;
    return { claimed: false };
  }

  const claim = createPhoneClaim<IvrPhoneClaimResult>();
  context.claimedNumbers.set(phone, claim);
  return { claimed: true, claim };
}

async function createOutreachAttemptAndCall(
  member: IvrQueueMember,
  phone: string,
  phoneClaim: IvrPhoneClaim | null,
  context: IvrQueueMemberContext,
): Promise<void> {
  let outreachAttemptId: number | null = null;
  let providerAttemptStarted = false;
  try {
    const dispatched = await withTwilioRetry(() => {
      providerAttemptStarted = false;
      return dispatchReservedVoiceCall({
      workspaceId: context.workspaceId,
      kind: context.billingKind, accountSid: context.twilio.accountSid, to: phone, from: context.callerId,
      campaignId: Number(context.campaignId), contactId: member.contact_id,
      queueId: member.id, userId: context.userId,
      operationKey: ivrQueueVoiceOperationKey(member.id),
      voiceUrl: context.ivrUrls.flowUrl, statusCallback: context.ivrUrls.statusCallback,
      prepareOutreach: async (tx) => {
        outreachAttemptId = await rpcCreateOutreachAttempt(createTenantDb(context.workspaceId, tx), {
          contactId: member.contact_id, campaignId: Number(context.campaignId),
          userId: context.userId, workspaceId: context.workspaceId, queueId: member.id,
        });
        return outreachAttemptId;
      },
      beforeCreate: async () => {
        await context.startPacer.waitForTurn();
        if (!isDispatchAllowedAt(context.callingPolicy)) {
          throw new CallingWindowClosedError("campaign");
        }
        if (!recipientCallingWindowStatus(phone).allowed) {
          throw new CallingWindowClosedError("recipient");
        }
      },
      create: ({ voiceUrl, statusCallback }) => {
        providerAttemptStarted = true;
        return context.twilio.calls.create({
          to: phone, from: context.callerId, url: voiceUrl,
          machineDetection: context.machineDetection,
          statusCallbackEvent: ["answered", "completed"], statusCallback,
        });
      },
      });
    }, { workspaceId: context.workspaceId, operation: "calls.create.ivr" });
    if (!dispatched.ok) {
      const pending = dispatched.reason === "dispatch_in_progress";
      phoneClaim?.resolve(pending ? "provider_pending" : "failed_before_provider");
      context.state.counts.deferred += 1;
      if (pending) context.state.blocked = "provider_recovery";
      else context.state.blocked ??= "insufficient_credits";
      return;
    }
    phoneClaim?.resolve(dispatched.replayed ? "duplicate" : "provider_attempted");

    await dequeueQueueEntry({
      by: { id: member.id },
      userId: context.userId,
      workspaceId: context.workspaceId,
      reason: dispatched.replayed ? DUPLICATE_IVR_DEQUEUED_REASON : IVR_CALL_DEQUEUED_REASON,
    });
    if (dispatched.replayed) context.state.counts.dequeued += 1;
    else context.state.counts.called += 1;
  } catch (error) {
    if (error instanceof VoiceDispatchUncertainError) {
      phoneClaim?.resolve("provider_pending");
      context.state.counts.deferred += 1;
      context.state.blocked = "provider_recovery";
      logger.warn("campaign_ivr_dispatch.provider_recovery", {
        workspaceId: context.workspaceId, campaignId: context.campaignId,
        queueId: member.id, reservationId: error.reservationId,
      });
      return;
    }
    if (error instanceof CallingWindowClosedError) {
      const windowResult = error.scope === "campaign" ? "campaign_window_closed" : "recipient_window_closed";
      phoneClaim?.resolve(
        providerAttemptStarted ? "provider_attempted" : windowResult,
      );
      await deleteUnusedOutreachAttempt(context.tdb, outreachAttemptId, providerAttemptStarted);
      context.state.counts.deferred += 1;
      if (error.scope === "campaign") {
        context.state.deferredAt ??= campaignWindowNextOpenAt(context.callingPolicy);
      }
      return;
    }

    phoneClaim?.resolve(
      providerAttemptStarted ? "provider_attempted" : "failed_before_provider",
    );
    const message = error instanceof Error ? error.message : String(error);
    context.state.counts.failed += 1;
    await recordQueueAttemptFailure({
      queueId: member.id,
      error: message,
      workspaceId: context.workspaceId,
    });
    logger.error("campaign_ivr_dispatch.call_failed", {
      campaignId: context.campaignId,
      queueId: member.id,
      error: message,
    });
  }
}

function remainingIvrQueue(
  selection: ReturnType<typeof selectEligibleCampaignQueueMembers>,
  counts: CampaignIvrDispatchCounts,
): number {
  return Math.max(
    0,
    selection.unselectedEligibleCount +
      counts.deferred +
      counts.failed -
      counts.exhausted,
  );
}

function campaignWindowDeferralAt(policy: ReturnType<typeof ivrCallingPolicy>): Date | null {
  return isDispatchAllowedAt(policy) ? null : campaignWindowNextOpenAt(policy);
}

async function deleteUnusedOutreachAttempt(
  tdb: ReturnType<typeof createTenantDb>,
  outreachAttemptId: number | null,
  providerAttemptStarted: boolean,
): Promise<void> {
  if (outreachAttemptId === null || providerAttemptStarted) return;
  await tdb.outreach_attempt.delete({
    where: eq(outreachAttemptTable.id, outreachAttemptId),
  });
}

type IvrPhoneClaimResult =
  | "campaign_window_closed"
  | "recipient_window_closed"
  | "failed_before_provider"
  | "provider_pending"
  | "duplicate"
  | "provider_attempted";

type IvrPhoneClaim = PhoneClaim<IvrPhoneClaimResult>;

class CallingWindowClosedError extends Error {
  constructor(readonly scope: "campaign" | "recipient") {
    super(`${scope} calling window closed before the provider attempt`);
    this.name = "CallingWindowClosedError";
  }
}
