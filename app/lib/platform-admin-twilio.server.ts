import {
  createWorkspaceTwilioInstance,
  syncWorkspaceTwilioSnapshot,
  updateWorkspaceTwilioPortalConfig,
} from "@/lib/database/workspace.server";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { persistWorkspaceBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import type { Database } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import {
  parseTwilioPortalConfigForm,
  parseTwilioRcsOnboardingForm,
} from "@/lib/schemas/twilio-portal-config";
import {
  TWILIO_RCS_PROVIDER,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import {
  ensureWorkspaceTwilioBootstrap,
  repairWorkspaceTwilioWebhooks,
  syncWorkspaceTwilioBootstrapState,
} from "@/lib/twilio-bootstrap.server";
import { auditWorkspaceTwilioWebhooks } from "@/lib/twilio-webhook-audit.server";
import { syncWorkspaceA2pStatus } from "@/lib/twilio-a2p-status-sync.server";
import { enqueueWorkspaceComplianceJob } from "@/lib/worker/handlers.server";
import {
  attachWorkspaceRcsSenderToPool,
  verifyWorkspaceMessagingSenderPool,
} from "@/lib/twilio-sender-pool.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { env } from "@/lib/env.server";
import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";


export type AdminTwilioActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; status?: number };

function recordToFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, String(item));
      }
      continue;
    }
    formData.set(key, String(value));
  }
  return formData;
}

export async function dispatchAdminTwilioAction({
  workspaceId,
  actorUserId,
  actorUsername,
  actionName,
  payload = {},
}: {
  workspaceId: string;
  actorUserId: string;
  actorUsername: string;
  actionName: string;
  payload?: Record<string, unknown>;
}): Promise<AdminTwilioActionResult> {
  const formData = recordToFormData(payload);

  switch (actionName) {
    case "sync_twilio_workspace":
      try {
        await syncWorkspaceTwilioSnapshot({ workspaceId });
        return { ok: true, message: "Twilio sync completed for this workspace" };
      } catch (error) {
        logger.error("Error syncing Twilio workspace snapshot:", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to sync Twilio workspace",
          status: 500,
        };
      }

    case "bootstrap_workspace_messaging":
      try {
        const bootstrap = await ensureWorkspaceTwilioBootstrap({
          workspaceId,
          actorUserId,
        });
        if (bootstrap.outcome === "success") {
          return { ok: true, message: "Workspace messaging bootstrap completed" };
        }
        if (bootstrap.outcome === "partial") {
          return {
            ok: true,
            message: `Bootstrap partial: ${bootstrap.lastError ?? "review drift messages"}`,
          };
        }
        return {
          ok: false,
          error: bootstrap.lastError ?? "Bootstrap failed",
          status: 500,
        };
      } catch (error) {
        logger.error("Error bootstrapping workspace messaging:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "audit_twilio_webhooks":
      try {
        const audit = await auditWorkspaceTwilioWebhooks({
          workspaceId,
        });
        await syncWorkspaceTwilioBootstrapState({ workspaceId });
        return {
          ok: true,
          message:
            audit.driftMessages.length === 0
              ? `No webhook drift. IVR hint: ${audit.ivrRuntimeHint}.`
              : `Drift found (${audit.driftMessages.length}): ${audit.driftMessages[0]}`,
        };
      } catch (error) {
        logger.error("Twilio webhook audit failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "repair_twilio_webhooks":
      try {
        const { repaired } = await repairWorkspaceTwilioWebhooks({
          workspaceId,
          actorUserId,
        });
        return {
          ok: true,
          message:
            repaired.length > 0
              ? `Repaired: ${repaired.join(", ")}`
              : "Nothing to repair",
        };
      } catch (error) {
        logger.error("Twilio webhook repair failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "run_billing_reconciliation":
      try {
        const twilioData = await loadWorkspaceTwilioData(workspaceId);
        const creds = readTwilioWorkspaceCredentials(twilioData);
        if (!creds?.sid) {
          return {
            ok: false,
            error: "Workspace has no Twilio credentials",
            status: 400,
          };
        }

        const twilio = await createWorkspaceTwilioInstance({           workspace_id: workspaceId,
        });
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
          source: "admin",
        });

        return {
          ok: true,
          message: snapshot.materialVariance
            ? "Reconciliation complete — material variance detected."
            : "Reconciliation complete — no material variance.",
        };
      } catch (error) {
        logger.error("Billing reconciliation run failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "trigger_twilio_open_sync": {
      const result = await triggerTwilioOpenSync({
        workspaceId,
        callLimit: 50,
        messageLimit: 50,
        maxAgeMinutes: 120,
      });
      return result.ok
        ? { ok: true, message: result.message }
        : { ok: false, error: result.error, status: 500 };
    }

    case "retry_compliance_job":
      try {
        await enqueueWorkspaceComplianceJob(workspaceId, "admin_retry");
        return { ok: true, message: "Compliance job re-queued for this workspace" };
      } catch (error) {
        logger.error("Error enqueueing workspace compliance retry:", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to enqueue compliance job",
          status: 500,
        };
      }

    case "sync_a2p_status":
      try {
        await syncWorkspaceA2pStatus({
          workspaceId,
          actorUserId,
        });
        return { ok: true, message: "A2P status synced from Twilio" };
      } catch (error) {
        logger.error("A2P status sync failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "verify_sender_pool":
      try {
        const result = await verifyWorkspaceMessagingSenderPool({
          workspaceId,
        });
        const poolMessage = result.inSync
          ? "Sender pool matches onboarding state"
          : `Sender pool drift: missing ${result.missingFromPool.join(", ") || "none"}; extra ${result.extraInPool.join(", ") || "none"}`;
        const rcsMessage = result.rcsSenderId
          ? ` RCS sender ${result.rcsSenderId} is ${result.rcsSenderInPool ? "attached to" : "NOT attached to"} the sender pool.`
          : "";
        return {
          ok: true,
          message: `${poolMessage}.${rcsMessage}`,
        };
      } catch (error) {
        logger.error("Sender pool verification failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "attach_rcs_sender_pool":
      try {
        const result = await attachWorkspaceRcsSenderToPool({
          workspaceId,
        });
        if (!result.serviceSid) {
          return {
            ok: false,
            error: "Provision a Messaging Service before attaching the RCS sender.",
            status: 400,
          };
        }
        if (!result.rcsSenderId) {
          return {
            ok: false,
            error: "Save the Twilio RCS sender SID (from Console) before attaching it to the pool.",
            status: 400,
          };
        }
        return {
          ok: true,
          message: result.alreadyInPool
            ? `RCS sender ${result.rcsSenderId} is already attached to the sender pool.`
            : `RCS sender ${result.rcsSenderId} attached to the sender pool.`,
        };
      } catch (error) {
        logger.error("RCS sender pool attach failed:", error);
        return { ok: false, error: twilioErrorUserMessage(error), status: 500 };
      }

    case "provision_workspace_a2p":
      try {
        await provisionWorkspaceA2P({
          workspaceId,
          actorUserId,
        });
        return { ok: true, message: "Workspace A2P provisioning started" };
      } catch (error) {
        logger.error("Error provisioning workspace A2P:", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to provision workspace A2P",
          status: 500,
        };
      }

    case "save_workspace_rcs":
      try {
        const rcsForm = parseTwilioRcsOnboardingForm(formData);
        await updateWorkspaceRcsOnboarding({
          workspaceId,
          actorUserId,
          provider: TWILIO_RCS_PROVIDER,
          displayName: rcsForm.displayName,
          publicDescription: rcsForm.publicDescription,
          logoImageUrl: rcsForm.logoImageUrl,
          bannerImageUrl: rcsForm.bannerImageUrl,
          accentColor: rcsForm.accentColor,
          optInPolicyImageUrl: rcsForm.optInPolicyImageUrl,
          useCaseVideoUrl: rcsForm.useCaseVideoUrl,
          representativeName: rcsForm.representativeName,
          representativeTitle: rcsForm.representativeTitle,
          representativeEmail: rcsForm.representativeEmail,
          notificationEmail: rcsForm.notificationEmail,
          agentId: rcsForm.agentId,
          senderId: rcsForm.senderId,
          regions: rcsForm.regions,
          notes: rcsForm.notes,
          status: rcsForm.status,
        });
        return { ok: true, message: "Workspace RCS state updated" };
      } catch (error) {
        logger.error("Error updating workspace RCS state:", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update workspace RCS state",
          status: 500,
        };
      }

    case "update_twilio_portal":
      try {
        const updates = parseTwilioPortalConfigForm(formData);
        await updateWorkspaceTwilioPortalConfig({
          workspaceId,
          actorUserId,
          actorUsername,
          updates,
        });
        return { ok: true, message: "Twilio portal settings updated" };
      } catch (error) {
        logger.error("Error updating Twilio portal settings:", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update Twilio portal settings",
          status: 500,
        };
      }

    default:
      return { ok: false, error: "Invalid action", status: 400 };
  }
}
