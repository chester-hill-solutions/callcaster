import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";
import { runNumberRentalBilling } from "@/lib/number-rental-billing.server";
import { reconcileWorkspaceBilling } from "@/lib/billing-reconcile-workspace.server";
import { runCronWorkspaceFanout } from "@/lib/cron-workspace-fanout.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import { runLowCreditNotify } from "@/lib/low-credit-notify.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import {
  auditWorkspaceTwilioWebhooks,
  repointWorkspaceTwilioWebhooks,
} from "@/lib/twilio-webhook-audit.server";
import { listAllWorkspacesOrdered } from "@/lib/workspace-members-db.server";
import {
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { scheduleNextDispatch } from "@/lib/worker/campaign-dispatch";
import {
  runCallStatusSideEffects,
  runRecordingSideEffects,
  runSmsStatusSideEffects,
} from "@/lib/worker/webhook-side-effects.server";
import {
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  CAMPAIGN_DISPATCH_JOB_TYPE,
  CAMPAIGN_EXPORT_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
} from "@/lib/worker/job-types.server";
import { logger } from "@/lib/logger.server";
import { addRequestIdToJobParams } from "@/lib/request-context.server";
import { db } from "@/server/db";
import { job as jobTable } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { ClaimedJobRow, JobHandlers } from "./poll-jobs.server";

const WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE = "workspace_twilio_compliance";

const LOW_CREDIT_NOTIFY_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const TWILIO_OPEN_SYNC_RESCHEDULE_MS = 5 * 60 * 1000;
const BILLING_RECONCILE_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const NUMBER_RENTAL_BILLING_RESCHEDULE_MS = 24 * 60 * 60 * 1000;

const TWILIO_WEBHOOK_AUDIT_JOB_TYPE = "twilio_webhook_audit";

// Webhook drift (legacy Supabase Edge URLs left on Twilio number/messaging
// service config) doesn't change quickly, but this job type exists
// specifically to catch stragglers during the Edge -> Remix `/api/*` cutover
// (Phase E), so it runs more often than the once-daily low-credit sweep.
const TWILIO_WEBHOOK_AUDIT_RESCHEDULE_MS = 6 * 60 * 60 * 1000;

async function rescheduleJob(
  type: string,
  delayMs: number,
  params: Record<string, unknown>,
  completedJobId: number,
): Promise<void> {
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  try {
    await db.insert(jobTable).values({
      type,
      status: "queued",
      retry_at: nextRunAt,
      params: addRequestIdToJobParams(params),
    });
  } catch (error) {
    logger.error(`worker.handler.${type}.reschedule_failed`, {
      jobId: completedJobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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

  let result: unknown;
  if (!workspaceId) {
    result = await runCronWorkspaceFanout({
      job: "twilio_open_sync",
      requireTwilioCredentials: true,
      run: async (id) => {
        const sync = await triggerTwilioOpenSync({
          workspaceId: id,
          callLimit,
          messageLimit,
          maxAgeMinutes,
        });
        if (!sync.ok) {
          throw new Error(sync.error);
        }
      },
    });
  } else {
    const sync = await triggerTwilioOpenSync({
      workspaceId,
      callLimit,
      messageLimit,
      maxAgeMinutes,
    });
    if (!sync.ok) {
      throw new Error(sync.error);
    }
    result = sync;
  }

  await rescheduleJob(
    "twilio_open_sync",
    TWILIO_OPEN_SYNC_RESCHEDULE_MS,
    { callLimit, messageLimit, maxAgeMinutes },
    job.id,
  );
  return result;
}

async function billingReconcileHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);

  let result: unknown;
  if (!workspaceId) {
    result = await runCronWorkspaceFanout({
      job: "billing_reconcile",
      requireTwilioCredentials: true,
      run: async (id) => {
        const { snapshot } = await reconcileWorkspaceBilling({
          workspaceId: id,
          source: "cron",
        });
        return snapshot;
      },
    });
  } else {
    const twilioData = await loadWorkspaceTwilioData(workspaceId);
    const creds = readTwilioWorkspaceCredentials(twilioData);
    if (!creds?.sid) {
      throw new Error("Workspace has no Twilio credentials");
    }

    const { snapshot } = await reconcileWorkspaceBilling({
      workspaceId,
      source: "cron",
    });

    result = {
      ok: true,
      materialVariance: snapshot.materialVariance,
      message: snapshot.materialVariance
        ? "Reconciliation complete — material variance detected."
        : "Reconciliation complete — no material variance.",
    };
  }

  await rescheduleJob(
    "billing_reconcile",
    BILLING_RECONCILE_RESCHEDULE_MS,
    {},
    job.id,
  );
  return result;
}

async function numberRentalBillingHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);

  let result: unknown;
  if (!workspaceId) {
    result = await runCronWorkspaceFanout({
      job: "number_rental_billing",
      requireTwilioCredentials: false,
      run: (id) => runNumberRentalBilling({ workspaceId: id }),
    });
  } else {
    result = await runNumberRentalBilling({ workspaceId });
  }

  await rescheduleJob(
    "number_rental_billing",
    NUMBER_RENTAL_BILLING_RESCHEDULE_MS,
    {},
    job.id,
  );
  return result;
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

async function lowCreditNotifyHandler(job: ClaimedJobRow): Promise<unknown> {
  const result = await runLowCreditNotify();

  // Self-re-enqueue ~24h out. The `job` table has no dedicated
  // scheduled/run-at column, but `claimNextJob` already only claims rows
  // where `retry_at IS NULL OR retry_at <= now()`, so a fresh queued row
  // with a future `retry_at` is deferred the same way a retry backoff is.
  const nextRunAt = new Date(
    Date.now() + LOW_CREDIT_NOTIFY_RESCHEDULE_MS,
  ).toISOString();
  try {
    await db.insert(jobTable).values({
      type: "low_credit_notify",
      status: "queued",
      retry_at: nextRunAt,
      params: {},
    });
  } catch (error) {
    logger.error("worker.handler.low_credit_notify.reschedule_failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

async function workspaceTwilioComplianceHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);
  if (!workspaceId) {
    throw new Error("Missing workspaceId for workspace_twilio_compliance job");
  }
  const reason =
    typeof params.reason === "string" ? params.reason : "worker";
  const actorUserId =
    job.user_id ??
    (typeof params.actorUserId === "string" ? params.actorUserId : null);

  await runWorkspaceTwilioComplianceJob({ workspaceId, reason, actorUserId });
  return { ok: true, workspaceId, reason };
}

type TwilioWebhookAuditWorkspaceResult = {
  workspaceId: string;
  driftCount: number;
  repaired?: number;
  repairErrors?: string[];
  error?: string;
};

/**
 * Scheduled Twilio webhook audit + optional auto-repair. Self-re-enqueuing,
 * same pattern as `lowCreditNotifyHandler`: loops every active workspace
 * (skipping ones with no Twilio subaccount credentials yet), audits live
 * Twilio webhook config against the canonical Remix `/api/*` URLs via
 * `auditWorkspaceTwilioWebhooks`, and — unless disabled via
 * `params.autoRepair === false` — repoints any drifted legacy Edge URLs via
 * `repointWorkspaceTwilioWebhooks`. When a workspace's webhooks were actually
 * repointed, it also kicks a `twilio-open-sync` sweep for that workspace so
 * local call/message status catches up against the freshly-repointed status
 * callback. One workspace's failure (e.g. revoked Twilio credentials) is
 * logged and skipped rather than aborting the whole sweep.
 */
async function twilioWebhookAuditHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const autoRepair = params.autoRepair !== false;

  const workspaces = await listAllWorkspacesOrdered();
  const results: TwilioWebhookAuditWorkspaceResult[] = [];

  for (const ws of workspaces) {
    if (ws.disabled) continue;
    try {
      const twilioData = await loadWorkspaceTwilioData(ws.id);
      const creds = readTwilioWorkspaceCredentials(twilioData);
      if (!creds?.sid) continue; // no Twilio subaccount provisioned yet

      const audit = await auditWorkspaceTwilioWebhooks({ workspaceId: ws.id });
      const entry: TwilioWebhookAuditWorkspaceResult = {
        workspaceId: ws.id,
        driftCount: audit.driftMessages.length,
      };

      if (audit.driftMessages.length > 0) {
        logger.warn("worker.handler.twilio_webhook_audit.drift_detected", {
          workspaceId: ws.id,
          driftCount: audit.driftMessages.length,
        });

        if (autoRepair) {
          const repair = await repointWorkspaceTwilioWebhooks({
            workspaceId: ws.id,
          });
          entry.repaired = repair.updated;
          entry.repairErrors = repair.errors;

          if (repair.updated > 0) {
            const syncResult = await triggerTwilioOpenSync({
              workspaceId: ws.id,
              callLimit: 50,
              messageLimit: 50,
              maxAgeMinutes: 120,
            });
            if (!syncResult.ok) {
              logger.error(
                "worker.handler.twilio_webhook_audit.post_repair_sync_failed",
                { workspaceId: ws.id, error: syncResult.error },
              );
            }
          }
        }
      }

      results.push(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("worker.handler.twilio_webhook_audit.workspace_failed", {
        workspaceId: ws.id,
        error: message,
      });
      results.push({ workspaceId: ws.id, driftCount: -1, error: message });
    }
  }

  // Self-re-enqueue ~6h out — see LOW_CREDIT_NOTIFY_RESCHEDULE_MS above for
  // why a future `retry_at` on a fresh queued row is a valid scheduling
  // mechanism given `claimNextJob`'s `retry_at IS NULL OR retry_at <= now()`.
  const nextRunAt = new Date(
    Date.now() + TWILIO_WEBHOOK_AUDIT_RESCHEDULE_MS,
  ).toISOString();
  try {
    await db.insert(jobTable).values({
      type: TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
      status: "queued",
      retry_at: nextRunAt,
      params: {},
    });
  } catch (error) {
    logger.error("worker.handler.twilio_webhook_audit.reschedule_failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ok: true,
    workspacesAudited: results.length,
    workspacesWithDrift: results.filter((r) => r.driftCount > 0).length,
    results,
  };
}

/**
 * Enqueue a Twilio compliance provisioning job for a workspace. Idempotent:
 * skips insertion when a queued/running job of the same type already exists for
 * the workspace, so repeated onboarding saves don't stack duplicate jobs.
 */
export async function enqueueWorkspaceComplianceJob(
  workspaceId: string,
  reason: string,
): Promise<void> {
  const existing = await db
    .select({ id: jobTable.id })
    .from(jobTable)
    .where(
      and(
        eq(jobTable.type, WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE),
        eq(jobTable.workspace_id, workspaceId),
        inArray(jobTable.status, ["queued", "running"]),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    logger.info("worker.enqueue.workspace_twilio_compliance.deduped", {
      workspaceId,
      reason,
    });
    return;
  }

  await db.insert(jobTable).values({
    type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
    status: "queued",
    workspace_id: workspaceId,
    params: addRequestIdToJobParams({ workspaceId, reason }),
  });
  logger.info("worker.enqueue.workspace_twilio_compliance", {
    workspaceId,
    reason,
  });
}

async function callStatusSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const callSid =
    typeof params.callSid === "string" ? params.callSid : undefined;
  const twilioParams =
    typeof params.twilioParams === "object" && params.twilioParams !== null
      ? (params.twilioParams as Record<string, string>)
      : undefined;

  if (!callSid || !twilioParams) {
    throw new Error("call_status_side_effects: missing callSid or twilioParams");
  }

  return runCallStatusSideEffects({ callSid, twilioParams });
}

async function smsStatusSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const messageSid =
    typeof params.messageSid === "string" ? params.messageSid : undefined;
  const twilioParams =
    typeof params.twilioParams === "object" && params.twilioParams !== null
      ? (params.twilioParams as Record<string, string>)
      : undefined;

  if (!messageSid || !twilioParams) {
    throw new Error("sms_status_side_effects: missing messageSid or twilioParams");
  }

  return runSmsStatusSideEffects({ messageSid, twilioParams });
}

async function recordingSideEffectsHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const callSid =
    typeof params.callSid === "string" ? params.callSid : undefined;
  const twilioParams =
    typeof params.twilioParams === "object" && params.twilioParams !== null
      ? (params.twilioParams as Record<string, string>)
      : undefined;

  if (!callSid || !twilioParams) {
    throw new Error("recording_side_effects: missing callSid or twilioParams");
  }

  return runRecordingSideEffects({ callSid, twilioParams });
}

async function campaignExportHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const campaignId =
    typeof params.campaignId === "number" ? params.campaignId : undefined;
  const exportId =
    typeof params.exportId === "string" ? params.exportId : undefined;
  const campaignName =
    typeof params.campaignName === "string" ? params.campaignName : "";
  const campaignType =
    typeof params.campaignType === "string" ? params.campaignType : undefined;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);

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

async function campaignDispatchHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const campaignId =
    typeof params.campaignId === "number" ? params.campaignId : undefined;
  const queueNextUrl =
    typeof params.queueNextUrl === "string" ? params.queueNextUrl : undefined;
  const owner =
    typeof params.owner === "string" ? params.owner : null;
  const headers =
    typeof params.headers === "object" && params.headers !== null
      ? (params.headers as Record<string, string>)
      : { "Content-Type": "application/json" };
  const delayMs =
    typeof params.delayMs === "number" ? params.delayMs : undefined;

  if (!campaignId || !queueNextUrl) {
    throw new Error(
      "campaign_dispatch: missing campaignId or queueNextUrl — enqueue only from a wired dispatch route",
    );
  }

  await scheduleNextDispatch({
    fetchImpl: fetch,
    queueNextUrl,
    headers,
    campaignId,
    owner,
    delayMs,
  });

  return { ok: true, campaignId };
}

async function webhookDeliveryHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId =
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined);
  const eventCategory =
    typeof params.eventCategory === "string" ? params.eventCategory : undefined;
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

export const jobHandlers: JobHandlers = {
  twilio_open_sync: twilioOpenSyncHandler,
  workspace_twilio_compliance: workspaceTwilioComplianceHandler,
  billing_reconcile: billingReconcileHandler,
  number_rental_billing: numberRentalBillingHandler,
  audience_upload: audienceUploadHandler,
  low_credit_notify: lowCreditNotifyHandler,
  twilio_webhook_audit: twilioWebhookAuditHandler,
  [CALL_STATUS_SIDE_EFFECTS_JOB_TYPE]: callStatusSideEffectsHandler,
  [SMS_STATUS_SIDE_EFFECTS_JOB_TYPE]: smsStatusSideEffectsHandler,
  [RECORDING_SIDE_EFFECTS_JOB_TYPE]: recordingSideEffectsHandler,
  [CAMPAIGN_EXPORT_JOB_TYPE]: campaignExportHandler,
  [CAMPAIGN_DISPATCH_JOB_TYPE]: campaignDispatchHandler,
  [WEBHOOK_DELIVERY_JOB_TYPE]: webhookDeliveryHandler,
};
