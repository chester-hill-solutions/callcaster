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
import { createTenantDb } from "@/server/tenant-db";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
} from "@/lib/database/workspace.server";
import { getCampaignQueueById, checkSchedule } from "@/lib/database/campaign.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import {
  claimBatchSizeForRate,
  configuredDispatcherVoiceCps,
  DISPATCH_TICK_MS,
} from "@/lib/throughput-config.server";
import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { insertCallForWorkspace, hasDuplicateCampaignCall } from "@/lib/telephony-db.server";
import { logger } from "@/lib/logger.server";

export const IVR_CALL_DEQUEUED_REASON = "IVR call completed";
export const OPTED_OUT_IVR_DEQUEUED_REASON = "Contact opted out";
export const DUPLICATE_IVR_DEQUEUED_REASON = "Duplicate IVR call prevented";

export type CampaignIvrBatchOutcome =
  | { kind: "insufficient_credits" }
  | { kind: "caller_id_required" }
  | { kind: "deferred_send_window" }
  | {
      kind: "dispatched";
      counts: {
        called: number;
        failed: number;
        /** Dequeued without a call: opted out. */
        dequeued: number;
        /** Left queued for a later tick (recipient quiet hours). */
        deferred: number;
      };
      /**
       * Rows still queued after this batch: recipient-window deferrals,
       * failed calls (which stay queued), and contacts beyond the claim.
       */
      queuedRemaining: number;
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
  if (!checkSchedule(campaign)) {
    return { kind: "deferred_send_window" };
  }

  const portalConfig = await getWorkspaceTwilioPortalConfig({ workspaceId });
  const claimSize = Math.max(
    1,
    claimBatchSizeForRate(configuredDispatcherVoiceCps(portalConfig), DISPATCH_TICK_MS),
  );

  const allQueued = await getCampaignQueueById({
    campaign_id: campaignId,
    onlyQueued: true,
  });
  const queueMembers =
    typeof args.maxContacts === "number"
      ? allQueued.slice(0, Math.min(args.maxContacts, claimSize))
      : allQueued.slice(0, claimSize);

  if (queueMembers.length === 0) {
    return {
      kind: "dispatched",
      counts: { called: 0, failed: 0, dequeued: 0, deferred: 0 },
      queuedRemaining: 0,
    };
  }

  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  const ivrUrls = resolveIvrCallUrls(campaignId);
  const tdb = createTenantDb(workspaceId);

  const counts = { called: 0, failed: 0, dequeued: 0, deferred: 0 };

  // In-batch normalized-number reservation. hasDuplicateCampaignCall reads
  // persisted call history and cannot see sibling rows still executing in this
  // same Promise.all — two queue rows for one household phone would both pass
  // and both dial. Reserve synchronously before the first await so the second
  // occurrence dequeues as a duplicate.
  const claimedNumbers = new Set<string>();

  // Claim size is CPS-derived (1–2 rows at legacy pacing), so a single
  // Promise.all per batch keeps us inside the workspace's call rate.
  await Promise.all(
    queueMembers.map(async (member) => {
      const phone = normalizePhoneNumber(member.contact?.phone || "");

      // Recipient-local quiet hours are temporary: leave the row queued for
      // a later in-window tick.
      const windowStatus = recipientCallingWindowStatus(phone);
      if (!windowStatus.allowed) {
        counts.deferred += 1;
        logger.info("campaign_ivr_dispatch.recipient_window_skip", {
          campaignId,
          queueId: member.id,
          timezone: windowStatus.timezone,
          reason: windowStatus.reason,
        });
        return;
      }

      if (member.contact?.opt_out) {
        await dequeueQueueEntry({
          by: { id: member.id },
          userId,
          reason: OPTED_OUT_IVR_DEQUEUED_REASON,
        });
        counts.dequeued += 1;
        return;
      }

      // Never dial the same number twice in one campaign (household phones).
      // Check + reserve synchronously before the first await; then confirm
      // against persisted call history for cross-batch / prior dispatches.
      if (phone && claimedNumbers.has(phone)) {
        await dequeueQueueEntry({
          by: { id: member.id },
          userId,
          reason: DUPLICATE_IVR_DEQUEUED_REASON,
        });
        counts.dequeued += 1;
        return;
      }
      if (phone) {
        claimedNumbers.add(phone);
      }
      if (
        phone &&
        (await hasDuplicateCampaignCall({
          workspaceId,
          campaignId,
          to: phone,
          tdb,
        }))
      ) {
        await dequeueQueueEntry({
          by: { id: member.id },
          userId,
          reason: DUPLICATE_IVR_DEQUEUED_REASON,
        });
        counts.dequeued += 1;
        return;
      }

      try {
        const outreachAttemptId = await rpcCreateOutreachAttempt(tdb, {
          contactId: member.contact_id,
          campaignId: Number(campaignId),
          userId,
          workspaceId,
          queueId: member.id,
        });

        const call = await withTwilioRetry(
          () =>
            twilio.calls.create({
              to: phone,
              from: callerId,
              url: ivrUrls.flowUrl,
              machineDetection: "Enable",
              statusCallbackEvent: ["answered", "completed"],
              statusCallback: ivrUrls.statusCallback,
            }),
          { workspaceId, operation: "calls.create.ivr" },
        );

        const inserted = await insertCallForWorkspace(workspaceId, {
          sid: call.sid,
          to: phone,
          from: callerId,
          campaign_id: Number(campaignId),
          contact_id: member.contact_id,
          outreach_attempt_id: Number(outreachAttemptId),
        });
        if (!inserted) {
          throw new Error("Failed to insert call row");
        }

        await dequeueQueueEntry({
          by: { id: member.id },
          userId,
          reason: IVR_CALL_DEQUEUED_REASON,
        });
        counts.called += 1;
      } catch (error) {
        // Failed calls stay queued: the duplicate-free queue is the retry
        // ledger, and the worker's all-failed guard escalates to job backoff.
        counts.failed += 1;
        logger.error("campaign_ivr_dispatch.call_failed", {
          campaignId,
          queueId: member.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  const truncated = allQueued.length - queueMembers.length;
  return {
    kind: "dispatched",
    counts,
    queuedRemaining: truncated + counts.deferred + counts.failed,
  };
}
