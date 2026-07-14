import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";
import { runNumberRentalBilling } from "@/lib/number-rental-billing.server";
import { reconcileWorkspaceBilling } from "@/lib/billing-reconcile-workspace.server";
import { runCronWorkspaceFanout } from "@/lib/cron-workspace-fanout.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { runLowCreditNotify } from "@/lib/low-credit-notify.server";
import {
  auditWorkspaceTwilioWebhooks,
  repointWorkspaceTwilioWebhooks,
} from "@/lib/twilio-webhook-audit.server";
import { listAllWorkspacesOrdered } from "@/lib/workspace-members-db.server";
import { logger } from "@/lib/logger.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { rescheduleJob, requireNumberParam, requireStringParam } from "./shared.server";

const LOW_CREDIT_NOTIFY_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const TWILIO_OPEN_SYNC_RESCHEDULE_MS = 5 * 60 * 1000;
const BILLING_RECONCILE_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const NUMBER_RENTAL_BILLING_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const TWILIO_WEBHOOK_AUDIT_RESCHEDULE_MS = 6 * 60 * 60 * 1000;

export const TWILIO_WEBHOOK_AUDIT_JOB_TYPE = "twilio_webhook_audit";

type TwilioWebhookAuditWorkspaceResult = {
  workspaceId: string;
  driftCount: number;
  repaired?: number;
  repairErrors?: string[];
  error?: string;
};

function resolveWorkspaceId(job: ClaimedJobRow): string | undefined {
  const params = (job.params ?? {}) as Record<string, unknown>;
  return (
    job.workspace_id ??
    (typeof params.workspaceId === "string" ? params.workspaceId : undefined) ??
    undefined
  );
}

/**
 * Optional workspace fanout: when workspaceId is absent, run across all
 * eligible workspaces; otherwise run once for that workspace.
 */
async function withOptionalWorkspaceFanout<T>(args: {
  job: string;
  workspaceId: string | undefined;
  requireTwilioCredentials: boolean;
  runOne: (workspaceId: string) => Promise<T>;
}): Promise<T | unknown> {
  if (!args.workspaceId) {
    return runCronWorkspaceFanout({
      job: args.job,
      requireTwilioCredentials: args.requireTwilioCredentials,
      run: args.runOne,
    });
  }
  return args.runOne(args.workspaceId);
}

export async function twilioOpenSyncHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const workspaceId = resolveWorkspaceId(job) ?? "";
  const callLimit = requireNumberParam(params, "callLimit") ?? 50;
  const messageLimit = requireNumberParam(params, "messageLimit") ?? 50;
  const maxAgeMinutes = requireNumberParam(params, "maxAgeMinutes") ?? 120;

  const result = await withOptionalWorkspaceFanout({
    job: "twilio_open_sync",
    workspaceId: workspaceId || undefined,
    requireTwilioCredentials: true,
    runOne: async (id) => {
      const sync = await triggerTwilioOpenSync({
        workspaceId: id,
        callLimit,
        messageLimit,
        maxAgeMinutes,
      });
      if (!sync.ok) {
        throw new Error(sync.error);
      }
      return sync;
    },
  });

  if (!workspaceId) {
    await rescheduleJob(
      "twilio_open_sync",
      TWILIO_OPEN_SYNC_RESCHEDULE_MS,
      { callLimit, messageLimit, maxAgeMinutes },
      job.id,
    );
  }
  return result;
}

export async function billingReconcileHandler(job: ClaimedJobRow): Promise<unknown> {
  const workspaceId = resolveWorkspaceId(job);

  const result = await withOptionalWorkspaceFanout({
    job: "billing_reconcile",
    workspaceId,
    requireTwilioCredentials: true,
    runOne: async (id) => {
      if (workspaceId) {
        const twilioData = await loadWorkspaceTwilioData(id);
        const creds = readTwilioWorkspaceCredentials(twilioData);
        if (!creds?.sid) {
          throw new Error("Workspace has no Twilio credentials");
        }
      }
      const { snapshot } = await reconcileWorkspaceBilling({
        workspaceId: id,
        source: "cron",
      });
      if (workspaceId) {
        return {
          ok: true,
          materialVariance: snapshot.materialVariance,
          message: snapshot.materialVariance
            ? "Reconciliation complete — material variance detected."
            : "Reconciliation complete — no material variance.",
        };
      }
      return snapshot;
    },
  });

  if (!workspaceId) {
    await rescheduleJob(
      "billing_reconcile",
      BILLING_RECONCILE_RESCHEDULE_MS,
      {},
      job.id,
    );
  }
  return result;
}

export async function numberRentalBillingHandler(
  job: ClaimedJobRow,
): Promise<unknown> {
  const workspaceId = resolveWorkspaceId(job);

  const result = await withOptionalWorkspaceFanout({
    job: "number_rental_billing",
    workspaceId,
    requireTwilioCredentials: false,
    runOne: (id) => runNumberRentalBilling({ workspaceId: id }),
  });

  if (!workspaceId) {
    await rescheduleJob(
      "number_rental_billing",
      NUMBER_RENTAL_BILLING_RESCHEDULE_MS,
      {},
      job.id,
    );
  }
  return result;
}

export async function lowCreditNotifyHandler(job: ClaimedJobRow): Promise<unknown> {
  const result = await runLowCreditNotify();
  await rescheduleJob(
    "low_credit_notify",
    LOW_CREDIT_NOTIFY_RESCHEDULE_MS,
    {},
    job.id,
  );
  return result;
}

/**
 * Scheduled Twilio webhook audit + optional auto-repair. Self-re-enqueuing.
 */
export async function twilioWebhookAuditHandler(job: ClaimedJobRow): Promise<unknown> {
  const params = (job.params ?? {}) as Record<string, unknown>;
  const autoRepair = params.autoRepair !== false;

  const workspaces = await listAllWorkspacesOrdered();
  const results: TwilioWebhookAuditWorkspaceResult[] = [];

  for (const ws of workspaces) {
    if (ws.disabled) continue;
    try {
      const twilioData = await loadWorkspaceTwilioData(ws.id);
      const creds = readTwilioWorkspaceCredentials(twilioData);
      if (!creds?.sid) continue;

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

  await rescheduleJob(
    TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
    TWILIO_WEBHOOK_AUDIT_RESCHEDULE_MS,
    {},
    job.id,
  );

  return {
    ok: true,
    workspacesAudited: results.length,
    workspacesWithDrift: results.filter((r) => r.driftCount > 0).length,
    results,
  };
}
