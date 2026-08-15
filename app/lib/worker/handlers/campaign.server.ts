import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import {
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";
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
/** Retry delay when the whole batch is deferred by the campaign send window. */
const SEND_WINDOW_RETRY_MS = 15 * 60 * 1000;

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
