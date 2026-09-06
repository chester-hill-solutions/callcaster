import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import {
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";
import { dispatchCampaignIvrBatch } from "@/lib/campaign-ivr-dispatch.server";
import {
  isMachineDispatchedVoiceCampaignType,
} from "@/lib/campaign-execution.server";
import {
  CAMPAIGN_DISPATCH_JOB_TYPE,
  WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
} from "@/lib/worker/job-types.server";
import {
  findCampaignInWorkspace,
  updateCampaignStatusInWorkspace,
} from "@/lib/campaign-ivr.server";
import { rpcTryCompleteCampaignIfDrained } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { DISPATCH_TICK_MS } from "@/lib/throughput-config";
import { logger } from "@/lib/logger.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import type { VoterListSource } from "@/lib/audience-upload-process.server";

// Re-exported for backwards compatibility: moved to job-types.server.ts in
// #1239 A3 so job-params.server.ts can reference it without importing this
// file (see job-params.server.ts's doc comment for why that'd cycle).
export { WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE };

export type AudienceUploadParams = {
  uploadId: number;
  audienceId: number;
  workspaceId: string | undefined;
  userId: string | undefined;
  fileContent: string;
  headerMapping: Record<string, string>;
  splitNameColumn: string | null;
  voterListSource: string | null;
};

export async function audienceUploadHandler(
  job: ClaimedJobRow,
  params: AudienceUploadParams,
): Promise<unknown> {
  const workspaceId = job.workspace_id ?? params.workspaceId;
  const userId = job.user_id ?? params.userId;

  if (!workspaceId || !userId) {
    throw new Error("audience_upload: missing workspaceId or userId");
  }

  await processAudienceUpload(
    params.uploadId,
    params.audienceId,
    workspaceId,
    userId,
    params.fileContent,
    params.headerMapping,
    params.splitNameColumn,
    undefined,
    // Same blind cast the old narrowing did — voterListSource was never
    // validated against the enum at this layer (see legacyNullableStringParam
    // in job-registry.server.ts for why that stays true post-migration).
    params.voterListSource as VoterListSource | null,
  );
  return { ok: true, uploadId: params.uploadId, audienceId: params.audienceId };
}

export type WorkspaceTwilioComplianceParams = {
  workspaceId: string | undefined;
  reason: string;
  actorUserId: string | undefined;
};

export async function workspaceTwilioComplianceHandler(
  job: ClaimedJobRow,
  params: WorkspaceTwilioComplianceParams,
): Promise<unknown> {
  const workspaceId = job.workspace_id ?? params.workspaceId;
  if (!workspaceId) {
    throw new Error("Missing workspaceId for workspace_twilio_compliance job");
  }
  const reason = params.reason;
  const actorUserId = job.user_id ?? params.actorUserId ?? null;

  await runWorkspaceTwilioComplianceJob({ workspaceId, reason, actorUserId });
  return { ok: true, workspaceId, reason };
}

/**
 * Enqueue a Twilio compliance provisioning job for a workspace. Idempotent:
 * skips insertion when a queued/running job of the same type already exists.
 */
export async function enqueueWorkspaceComplianceJob(
  workspaceId: string,
  reason: string,
): Promise<void> {
  const result = await enqueueRegisteredJob({
    type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
    workspaceId,
    params: { workspaceId, reason, actorUserId: undefined },
    dedupe: { kind: "live", workspaceId },
  });
  if (result.deduped) {
    logger.info("worker.enqueue.workspace_twilio_compliance.deduped", {
      workspaceId,
      reason,
    });
    return;
  }
  logger.info("worker.enqueue.workspace_twilio_compliance", {
    workspaceId,
    reason,
    jobId: result.jobId,
  });
}

export type CampaignExportParams = {
  campaignId: number;
  exportId: string;
  campaignName: string;
  campaignType: string;
  workspaceId: string | undefined;
};

export async function campaignExportHandler(
  job: ClaimedJobRow,
  params: CampaignExportParams,
): Promise<unknown> {
  const { campaignId, exportId, campaignName, campaignType } = params;
  const workspaceId = job.workspace_id ?? params.workspaceId;

  if (!workspaceId) {
    throw new Error("campaign_export: missing workspaceId");
  }

  if (campaignType === "message") {
    await processMessageCampaignExport(
      campaignId,
      workspaceId,
      exportId,
      campaignName,
    );
  } else if (campaignType === "live_call" || campaignType === "robocall") {
    await processCallCampaignExport(
      campaignId,
      workspaceId,
      exportId,
      campaignName,
    );
  } else {
    throw new Error(`campaign_export: unsupported campaign type ${campaignType}`);
  }

  return { ok: true, exportId, campaignId };
}

/** Queue rows processed per dispatch job; remaining work rolls to a successor. */
const DISPATCH_BATCH_SIZE = 50;
/** Retry delay for deferrals without an exact next-open instant (schedule
 *  sweep waiting flips, IVR calling-hours gate). The SMS send-window gate
 *  instead schedules its successor at the exact window boundary (#1352). */
const SEND_WINDOW_RETRY_MS = 15 * 60 * 1000;
/** Upper bound on one send-window deferral. The successor wakes at
 *  min(nextOpenAt, now + this): exact for boundaries within reach (#1352),
 *  but a boundary days away cannot pin the chain to window config that may
 *  change first. Every wake re-reads the campaign, so a window edited or
 *  removed while deferred takes effect within one bounded hop, and the hop
 *  that lands inside the cap still resumes exactly at the true boundary. */
const SEND_WINDOW_MAX_DEFER_MS = 60 * 60 * 1000;

/** Milliseconds until a campaign's start date; 0 when unset, invalid, or past. */
function msUntilCampaignStart(
  startDate: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!startDate) return 0;
  const startMs = new Date(startDate).getTime();
  if (Number.isNaN(startMs)) return 0;
  return Math.max(0, startMs - now);
}

async function enqueueDispatchSuccessor(args: {
  workspaceId: string;
  campaignId: number;
  userId: string;
  completedJobId: number;
  delayMs: number;
}): Promise<void> {
  await enqueueRegisteredJob({
    type: CAMPAIGN_DISPATCH_JOB_TYPE,
    workspaceId: args.workspaceId,
    userId: args.userId,
    params: {
      campaignId: args.campaignId,
      workspaceId: args.workspaceId,
      userId: args.userId,
    },
    runAt: new Date(Date.now() + args.delayMs),
    dedupe: {
      kind: "live",
      workspaceId: args.workspaceId,
      campaignId: args.campaignId,
      excludeJobId: args.completedJobId,
    },
  });
}

export type CampaignDispatchParams = {
  campaignId: number;
  workspaceId: string | undefined;
  userId: string | undefined;
};

export async function campaignDispatchHandler(
  job: ClaimedJobRow,
  params: CampaignDispatchParams,
): Promise<unknown> {
  const { campaignId } = params;
  const workspaceId = job.workspace_id ?? params.workspaceId;
  // The launching actor. Required: dequeues and outreach attempts are
  // attributed to a real user, never a synthetic "system" id.
  const userId = job.user_id ?? params.userId;

  if (!workspaceId) {
    throw new Error("campaign_dispatch: missing workspaceId");
  }
  if (!userId) {
    throw new Error("campaign_dispatch: missing userId (launching actor)");
  }

  const campaignRecord = await findCampaignInWorkspace(workspaceId, String(campaignId));
  if (!campaignRecord) {
    throw new Error(`campaign_dispatch: campaign ${campaignId} not found`);
  }

  if (campaignRecord.type !== "message" && !isMachineDispatchedVoiceCampaignType(campaignRecord.type)) {
    logger.warn("campaign_dispatch.wrong_type", {
      campaignId,
      type: campaignRecord.type,
    });
    return { ok: true, campaignId, skipped: true, reason: "not_dispatchable_campaign" };
  }

  // Expired campaigns terminalize here — before the scheduled->running flip
  // below — so an end date that passed while contacts were still queued (or a
  // scheduled start that arrives after the end date) can no longer leave the
  // campaign stuck "running" with an undrained queue. Only active/queued
  // states move to complete; paused/draft/archived/complete keep the status
  // the user chose.
  if (
    campaignRecord.end_date &&
    new Date(campaignRecord.end_date) < new Date()
  ) {
    const terminalizable = new Set([
      "running",
      "scheduled",
      "waiting",
      "pending",
    ]);
    if (campaignRecord.status && terminalizable.has(campaignRecord.status)) {
      await updateCampaignStatusInWorkspace(workspaceId, campaignId, {
        status: "complete",
      });
    }
    logger.info("campaign_dispatch.expired", {
      campaignId,
      previousStatus: campaignRecord.status,
    });
    return { ok: true, campaignId, expired: true };
  }

  // Claim: a scheduled campaign whose runAt has arrived transitions to
  // running here. Paused/archived/complete campaigns end the chain.
  if (campaignRecord.status === "scheduled") {
    const startsInMs = msUntilCampaignStart(campaignRecord.start_date);
    if (startsInMs > 0) {
      await enqueueDispatchSuccessor({
        workspaceId,
        campaignId,
        userId,
        completedJobId: job.id,
        delayMs: Math.min(startsInMs, SEND_WINDOW_MAX_DEFER_MS),
      });
      return { ok: true, campaignId, deferred: "scheduled_start" };
    }
    await updateCampaignStatusInWorkspace(workspaceId, campaignId, {
      status: "running",
    });
  } else if (campaignRecord.status !== "running") {
    // A machine-dialled voice campaign parked on `waiting` by the schedule
    // sweep (#1168 — the sweep owns voice status truth) must not kill the
    // chain: keep ticking until the sweep flips it back to running.
    if (
      campaignRecord.type !== "message" &&
      campaignRecord.status === "waiting"
    ) {
      await enqueueDispatchSuccessor({
        workspaceId,
        campaignId,
        userId,
        completedJobId: job.id,
        delayMs: SEND_WINDOW_RETRY_MS,
      });
      return { ok: true, campaignId, deferred: "waiting_for_schedule" };
    }
    logger.info("campaign_dispatch.skipped", {
      campaignId,
      status: campaignRecord.status,
    });
    return { ok: true, campaignId, skipped: true, reason: campaignRecord.status };
  }

  if (campaignRecord.type !== "message") {
    return runMachineVoiceDispatch(job, {
      workspaceId,
      campaignId,
      userId,
    });
  }

  const outcome = await dispatchCampaignSmsBatch({
    workspaceId,
    campaignId: String(campaignId),
    userId,
    maxContacts: DISPATCH_BATCH_SIZE,
  });

  switch (outcome.kind) {
    case "insufficient_credits":
      // Not retried: dispatch resumes when the user relaunches after top-up.
      logger.warn("campaign_dispatch.insufficient_credits", { campaignId, workspaceId });
      return { ok: true, campaignId, blocked: "insufficient_credits" };
    case "caller_id_required":
      // Config error — retrying cannot fix it; surface loudly and stop.
      logger.error("campaign_dispatch.caller_id_required", { campaignId, workspaceId });
      return { ok: true, campaignId, blocked: "caller_id_required" };
    case "deferred_send_window": {
      // Schedule the successor at the exact window boundary (#1352): the
      // batch's outcome carries the next open instant, so dispatch resumes
      // the moment sending is allowed. Cap the sleep (see
      // SEND_WINDOW_MAX_DEFER_MS) so a far-future boundary cannot pin the
      // chain to config that may change before then.
      const exactDelayMs = Math.max(0, outcome.nextOpenAt.getTime() - Date.now());
      await enqueueDispatchSuccessor({
        workspaceId,
        campaignId,
        userId,
        completedJobId: job.id,
        delayMs: Math.min(exactDelayMs, SEND_WINDOW_MAX_DEFER_MS),
      });
      return { ok: true, campaignId, deferred: "send_window" };
    }
    case "dispatched": {
      const { counts, queuedRemaining } = outcome;

      // The balance ran out inside the batch: stop the chain exactly as the
      // entry gate does. Rows the budget refused stay queued for a relaunch.
      if (outcome.creditsExhausted) {
        logger.warn("campaign_dispatch.insufficient_credits", {
          campaignId,
          workspaceId,
          sent: counts.sent,
          unaffordable: counts.unaffordable,
        });
        return {
          ok: true,
          campaignId,
          blocked: "insufficient_credits",
          sent: counts.sent,
          unaffordable: counts.unaffordable,
        };
      }

      // Every attempted send failed and nothing was dequeued: let the job
      // retry with backoff instead of hot-looping successors. Failed rows
      // stay queued and the duplicate gate keeps retries single-send.
      if (counts.failed > 0 && counts.sent === 0 && counts.dequeued === 0) {
        throw new Error(
          `campaign_dispatch: all ${counts.failed} sends failed for campaign ${campaignId}`,
        );
      }

      if (queuedRemaining > 0) {
        await enqueueDispatchSuccessor({
          workspaceId,
          campaignId,
          userId,
          completedJobId: job.id,
          delayMs: DISPATCH_TICK_MS,
        });
      } else {
        const completed = await rpcTryCompleteCampaignIfDrained(
          createTenantDb(workspaceId),
          campaignId,
        );
        if (completed) {
          logger.info("campaign_dispatch.completed", { campaignId, workspaceId });
        }
      }

      return {
        ok: true,
        campaignId,
        sent: counts.sent,
        failed: counts.failed,
        dequeued: counts.dequeued,
        deferred: counts.deferred,
        unaffordable: counts.unaffordable,
        queuedRemaining,
      };
    }
  }
}

/**
 * IVR branch of the dispatch chain: same claim/successor/completion
 * orchestration as the SMS path, around `dispatchCampaignIvrBatch`.
 */
async function runMachineVoiceDispatch(
  job: ClaimedJobRow,
  args: { workspaceId: string; campaignId: number; userId: string },
): Promise<unknown> {
  const { workspaceId, campaignId, userId } = args;

  const outcome = await dispatchCampaignIvrBatch({
    workspaceId,
    campaignId: String(campaignId),
    userId,
  });

  switch (outcome.kind) {
    case "insufficient_credits":
      // Not retried: dispatch resumes when the user relaunches after top-up.
      logger.warn("campaign_dispatch.insufficient_credits", { campaignId, workspaceId });
      return { ok: true, campaignId, blocked: "insufficient_credits" };
    case "caller_id_required":
      // Config error — retrying cannot fix it; surface loudly and stop.
      logger.error("campaign_dispatch.caller_id_required", { campaignId, workspaceId });
      return { ok: true, campaignId, blocked: "caller_id_required" };
    case "deferred_send_window":
      await enqueueDispatchSuccessor({
        workspaceId,
        campaignId,
        userId,
        completedJobId: job.id,
        delayMs: SEND_WINDOW_RETRY_MS,
      });
      return { ok: true, campaignId, deferred: "send_window" };
    case "dispatched": {
      const { counts, queuedRemaining } = outcome;

      // Every attempted call failed and nothing was dequeued: let the job
      // retry with backoff instead of hot-looping successors. Failed rows
      // stay queued and the next tick re-attempts them.
      if (counts.failed > 0 && counts.called === 0 && counts.dequeued === 0) {
        throw new Error(
          `campaign_dispatch: all ${counts.failed} IVR calls failed for campaign ${campaignId}`,
        );
      }

      if (queuedRemaining > 0) {
        await enqueueDispatchSuccessor({
          workspaceId,
          campaignId,
          userId,
          completedJobId: job.id,
          delayMs: DISPATCH_TICK_MS,
        });
      } else {
        const completed = await rpcTryCompleteCampaignIfDrained(
          createTenantDb(workspaceId),
          campaignId,
        );
        if (completed) {
          logger.info("campaign_dispatch.completed", { campaignId, workspaceId });
        }
      }

      return {
        ok: true,
        campaignId,
        called: counts.called,
        failed: counts.failed,
        dequeued: counts.dequeued,
        deferred: counts.deferred,
        queuedRemaining,
      };
    }
  }
}

export type WebhookDeliveryParams = {
  workspaceId: string | undefined;
  eventCategory: string;
  eventType: "INSERT" | "UPDATE";
  payload: Record<string, unknown>;
  optional: boolean;
};

export async function webhookDeliveryHandler(
  job: ClaimedJobRow,
  params: WebhookDeliveryParams,
): Promise<unknown> {
  const workspaceId = job.workspace_id ?? params.workspaceId;
  if (!workspaceId) {
    throw new Error("webhook_delivery: missing workspaceId");
  }

  const result = await sendWorkspaceWebhookNotification({
    workspaceId,
    eventCategory: params.eventCategory,
    eventType: params.eventType,
    payload: params.payload,
    optional: params.optional,
  });

  if (!result.success) {
    throw new Error(result.error ?? "webhook_delivery failed");
  }

  return { ok: true };
}
