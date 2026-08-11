import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import {
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { scheduleNextDispatch } from "@/lib/worker/campaign-dispatch";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { sendSingleCampaignSms } from "@/lib/campaign-sms-send.server";
import { getCampaignQueueById } from "@/lib/database/campaign.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import type { Campaign, WorkspaceTwilioOpsConfig } from "@/lib/types";
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

export async function campaignDispatchHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const campaignId = requireNumberParam(params, "campaignId");
  const workspaceId = job.workspace_id ?? requireStringParam(params, "workspaceId");

  if (!campaignId || !workspaceId) {
    throw new Error(
      "campaign_dispatch: missing campaignId or workspaceId",
    );
  }

  // Load campaign and queued contacts.
  const [campaignRecord, audience] = await Promise.all([
    findCampaignInWorkspace(workspaceId, String(campaignId)),
    getCampaignQueueById({ campaign_id: String(campaignId), onlyQueued: true }),
  ]);

  if (!campaignRecord) {
    throw new Error(`campaign_dispatch: campaign ${campaignId} not found`);
  }

  // Verify campaign is still active.
  if (campaignRecord.status !== "running" && campaignRecord.status !== "scheduled") {
    logger.info("campaign_dispatch.skipped", { campaignId, status: campaignRecord.status });
    return { ok: true, campaignId, skipped: true };
  }

  // Check expired dates.
  const now = new Date();
  if (campaignRecord.end_date && new Date(campaignRecord.end_date) < now) {
    logger.info("campaign_dispatch.expired", { campaignId });
    return { ok: true, campaignId, expired: true };
  }

  const queueMembers = audience ?? [];
  if (queueMembers.length === 0) {
    logger.info("campaign_dispatch.empty_queue", { campaignId });
    return { ok: true, campaignId, empty: true };
  }

  // Process a batch of queued contacts.
  const BATCH_SIZE = 10;
  const batch = queueMembers.slice(0, BATCH_SIZE);
  const results = [];

  for (const member of batch) {
    const normalizedPhone = member.contact?.phone ?? "";
    try {
      const campaignBody = (campaignRecord as Campaign).body_text;
      const result = await sendSingleCampaignSms({
        body: campaignBody ?? "",
        media: [],
        to: normalizedPhone,
        from: campaignRecord.caller_id ?? "",
        campaign_id: String(campaignId),
        workspace: workspaceId,
        contact_id: member.contact_id,
        queue_id: member.id,
        user_id: job.user_id ?? "system",
        portalConfig: {} as WorkspaceTwilioOpsConfig,
        messagingServiceSidFromRequest: null,
      });
      results.push({ contact_id: member.contact_id, success: true });
    } catch (err) {
      logger.error("campaign_dispatch.send_failed", { campaignId, contactId: member.contact_id, error: err instanceof Error ? err.message : String(err) });
      results.push({ contact_id: member.contact_id, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Re-enqueue for remaining work if queue still has members.
  if (queueMembers.length > BATCH_SIZE) {
    await enqueueJob({
      type: "campaign_dispatch",
      workspaceId,
      params: { campaignId, workspaceId },
      dedupe: { kind: "live", workspaceId },
    });
  }

  return { ok: true, campaignId, sent: results.length, results };
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
