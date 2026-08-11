import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import {
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";
import { CAMPAIGN_DISPATCH_JOB_TYPE } from "@/lib/worker/job-types.server";
import {
  findCampaignInWorkspace,
  updateCampaignStatusInWorkspace,
} from "@/lib/campaign-ivr.server";
import { rpcTryCompleteCampaignIfDrained } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { DISPATCH_TICK_MS } from "@/lib/throughput-config";
import { logger } from "@/lib/logger.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import {
  requireNumberParam,
  requireRecordParam,
  requireStringParam,
} from "./shared.server";

export const WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE = "workspace_twilio_compliance";

export async function audienceUploadHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const uploadId = requireNumberParam(params, "uploadId");
  const audienceId = requireNumberParam(params, "audienceId");
  const workspaceId =
    job.workspace_id ?? requireStringParam(params, "workspaceId");
  const userId = job.user_id ?? requireStringParam(params, "userId");
  const fileContent =
    typeof params.fileContent === "string" ? params.fileContent : "";
  const headerMapping =
    typeof params.headerMapping === "object" && params.headerMapping !== null
      ? (params.headerMapping as Record<string, string>)
      : {};
  const splitNameColumn =
    typeof params.splitNameColumn === "string" ? params.splitNameColumn : null;
  const voterListSource =
    typeof params.voterListSource === "string"
      ? (params.voterListSource as
          | "liberalist"
          | "van"
          | "elections_canada"
          | "elections_ontario"
          | "manual"
          | "other"
          | null)
      : null;

  if (!uploadId || !audienceId || !workspaceId || !userId) {
    throw new Error("Missing required audience upload parameters");
  }

  await processAudienceUpload(
    uploadId,
    audienceId,
    workspaceId,
    userId,
    fileContent,
    headerMapping,
    splitNameColumn,
    undefined,
    voterListSource,
  );
  return { ok: true, uploadId, audienceId };
}

export async function workspaceTwilioComplianceHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ?? requireStringParam(params, "workspaceId");
  if (!workspaceId) {
    throw new Error("Missing workspaceId for workspace_twilio_compliance job");
  }
  const reason = requireStringParam(params, "reason") ?? "worker";
  const actorUserId =
    job.user_id ?? requireStringParam(params, "actorUserId") ?? null;

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
  const result = await enqueueJob({
    type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
    workspaceId,
    params: { workspaceId, reason },
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

export async function campaignExportHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const campaignId = requireNumberParam(params, "campaignId");
  const exportId = requireStringParam(params, "exportId");
  const campaignName = requireStringParam(params, "campaignName") ?? "";
  const campaignType = requireStringParam(params, "campaignType");
  const workspaceId =
    job.workspace_id ?? requireStringParam(params, "workspaceId");

  if (!campaignId || !exportId || !workspaceId || !campaignType) {
    throw new Error(
      "campaign_export: missing campaignId, exportId, workspaceId, or campaignType",
    );
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
/** Retry delay when the whole batch is deferred by the campaign send window. */
const SEND_WINDOW_RETRY_MS = 15 * 60 * 1000;

async function enqueueDispatchSuccessor(args: {
  workspaceId: string;
  campaignId: number;
  userId: string;
  completedJobId: number;
  delayMs: number;
}): Promise<void> {
  await enqueueJob({
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

export async function campaignDispatchHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const campaignId = requireNumberParam(params, "campaignId");
  const workspaceId = job.workspace_id ?? requireStringParam(params, "workspaceId");
  // The launching actor. Required: dequeues and outreach attempts are
  // attributed to a real user, never a synthetic "system" id.
  const userId = job.user_id ?? requireStringParam(params, "userId");

  if (!campaignId || !workspaceId) {
    throw new Error("campaign_dispatch: missing campaignId or workspaceId");
  }
  if (!userId) {
    throw new Error("campaign_dispatch: missing userId (launching actor)");
  }

  const campaignRecord = await findCampaignInWorkspace(workspaceId, String(campaignId));
  if (!campaignRecord) {
    throw new Error(`campaign_dispatch: campaign ${campaignId} not found`);
  }

  if (campaignRecord.type !== "message") {
    logger.warn("campaign_dispatch.wrong_type", {
      campaignId,
      type: campaignRecord.type,
    });
    return { ok: true, campaignId, skipped: true, reason: "not_message_campaign" };
  }

  // Claim: a scheduled campaign whose runAt has arrived transitions to
  // running here. Paused/archived/complete campaigns end the chain.
  if (campaignRecord.status === "scheduled") {
    await updateCampaignStatusInWorkspace(workspaceId, campaignId, {
      status: "running",
      is_active: true,
    });
  } else if (campaignRecord.status !== "running") {
    logger.info("campaign_dispatch.skipped", {
      campaignId,
      status: campaignRecord.status,
    });
    return { ok: true, campaignId, skipped: true, reason: campaignRecord.status };
  }

  if (campaignRecord.end_date && new Date(campaignRecord.end_date) < new Date()) {
    logger.info("campaign_dispatch.expired", { campaignId });
    return { ok: true, campaignId, expired: true };
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
        queuedRemaining,
      };
    }
  }
}

export async function webhookDeliveryHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ?? requireStringParam(params, "workspaceId");
  const eventCategory = requireStringParam(params, "eventCategory");
  const eventType =
    params.eventType === "INSERT" || params.eventType === "UPDATE"
      ? params.eventType
      : undefined;
  const payload =
    typeof params.payload === "object" && params.payload !== null
      ? (params.payload as Record<string, unknown>)
      : undefined;
  const optional = params.optional === true;

  if (!workspaceId || !eventCategory || !eventType || !payload) {
    throw new Error(
      "webhook_delivery: missing workspaceId, eventCategory, eventType, or payload",
    );
  }

  const result = await sendWorkspaceWebhookNotification({
    workspaceId,
    eventCategory,
    eventType,
    payload,
    optional,
  });

  if (!result.success) {
    throw new Error(result.error ?? "webhook_delivery failed");
  }

  return { ok: true };
}
