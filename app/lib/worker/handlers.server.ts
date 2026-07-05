import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";
import { runNumberRentalBilling } from "@/lib/number-rental-billing.server";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { persistWorkspaceBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import { logger } from "@/lib/logger.server";
import type { ClaimedJobRow, JobHandlers } from "./poll-jobs.server";

async function twilioOpenSyncHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : "");
  const callLimit = typeof params.callLimit === "number" ? params.callLimit : 50;
  const messageLimit =
    typeof params.messageLimit === "number" ? params.messageLimit : 50;
  const maxAgeMinutes =
    typeof params.maxAgeMinutes === "number" ? params.maxAgeMinutes : 120;

  const result = await triggerTwilioOpenSync({
    workspaceId,
    callLimit,
    messageLimit,
    maxAgeMinutes,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

async function billingReconcileHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);

  if (!workspaceId) {
    throw new Error("Missing workspaceId");
  }

  const twilioData = await loadWorkspaceTwilioData(workspaceId);
  const creds = readTwilioWorkspaceCredentials(twilioData);
  if (!creds?.sid) {
    throw new Error("Workspace has no Twilio credentials");
  }

  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  const usageRecords = await twilio.usage.records.list();
  const twilioUsage = usageRecords.map((record) => ({
    category: record.category,
    description: record.description,
    usage: record.usage,
    usageUnit: record.usageUnit,
    price: record.price.toString(),
    startDate: record.startDate?.toISOString(),
    endDate: record.endDate?.toISOString(),
  }));

  const report = await loadBillingReconciliationReport({
    workspaceId,
    twilioUsage,
  });
  const snapshot = await persistWorkspaceBillingReconciliationSnapshot({
    workspaceId,
    report,
    source: "cron",
  });

  return {
    ok: true,
    materialVariance: snapshot.materialVariance,
    message: snapshot.materialVariance
      ? "Reconciliation complete — material variance detected."
      : "Reconciliation complete — no material variance.",
  };
}

async function numberRentalBillingHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);
  return runNumberRentalBilling({ workspaceId });
}

async function audienceUploadHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const uploadId =
    typeof params.uploadId === "number" ? params.uploadId : undefined;
  const audienceId =
    typeof params.audienceId === "number" ? params.audienceId : undefined;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);
  const userId =
    job.user_id ??
    (typeof params.userId === "string" ? params.userId : undefined);
  const fileContent =
    typeof params.fileContent === "string" ? params.fileContent : "";
  const headerMapping =
    typeof params.headerMapping === "object" && params.headerMapping !== null
      ? (params.headerMapping as Record<string, string>)
      : {};
  const splitNameColumn =
    typeof params.splitNameColumn === "string"
      ? params.splitNameColumn
      : null;
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

export const jobHandlers: JobHandlers = {
  twilio_open_sync: twilioOpenSyncHandler,
  billing_reconcile: billingReconcileHandler,
  number_rental_billing: numberRentalBillingHandler,
  audience_upload: audienceUploadHandler,
  campaign_export: async () => {
    logger.warn("worker.handler.campaign_export.stub");
    return { ok: true, message: "TODO: implement campaign_export handler" };
  },
  campaign_dispatch: async () => {
    logger.warn("worker.handler.campaign_dispatch.stub");
    return { ok: true, message: "TODO: implement campaign_dispatch handler" };
  },
  webhook_delivery: async () => {
    logger.warn("worker.handler.webhook_delivery.stub");
    return { ok: true, message: "TODO: implement webhook_delivery handler" };
  },
};
