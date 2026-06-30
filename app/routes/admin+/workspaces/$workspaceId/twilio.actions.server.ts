import { data as routeData, type ActionFunctionArgs } from "react-router";

import {
  createWorkspaceTwilioInstance,
  syncWorkspaceTwilioSnapshot,
  updateWorkspaceTwilioPortalConfig,
} from "@/lib/database.server";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { persistWorkspaceBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import { logger } from "@/lib/logger.server";
import { parseTwilioPortalConfigForm, parseTwilioRcsOnboardingForm } from "@/lib/schemas/twilio-portal-config";
import { TWILIO_RCS_PROVIDER, updateWorkspaceRcsOnboarding } from "@/lib/rcs-onboarding.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import {
  ensureWorkspaceTwilioBootstrap,
  repairWorkspaceTwilioWebhooks,
  syncWorkspaceTwilioBootstrapState,
} from "@/lib/twilio-bootstrap.server";
import { auditWorkspaceTwilioWebhooks } from "@/lib/twilio-webhook-audit.server";
import { syncWorkspaceA2pStatus } from "@/lib/twilio-a2p-status-sync.server";
import { verifyWorkspaceMessagingSenderPool } from "@/lib/twilio-sender-pool.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";

import { requireSudoAdmin } from "../../requireSudoAdmin.server";
export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { user, userData } = await requireSudoAdmin(request);

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        return routeData({ error: "Workspace ID is required" }, { status: 400 });
    }

    const formData = await request.formData();
    const actionName = formData.get("_action");

    if (actionName === "sync_twilio_workspace") {
        try {
            await syncWorkspaceTwilioSnapshot({
                workspaceId,
            });
            return routeData({ success: "Twilio sync completed for this workspace" });
        } catch (error) {
            logger.error("Error syncing Twilio workspace snapshot:", error);
            return routeData(
                { error: error instanceof Error ? error.message : "Failed to sync Twilio workspace" },
                { status: 500 },
            );
        }
    }

    if (actionName === "bootstrap_workspace_messaging") {
        try {
            const bootstrap = await ensureWorkspaceTwilioBootstrap({
                workspaceId,
                actorUserId: user.id,
            });
            if (bootstrap.outcome === "success") {
              return routeData({ success: "Workspace messaging bootstrap completed" });
            }
            if (bootstrap.outcome === "partial") {
              return routeData({
                success: `Bootstrap partial: ${bootstrap.lastError ?? "review drift messages"}`,
              });
            }
            return routeData(
              { error: bootstrap.lastError ?? "Bootstrap failed" },
              { status: 500 },
            );
        } catch (error) {
            logger.error("Error bootstrapping workspace messaging:", error);
            return routeData(
                { error: twilioErrorUserMessage(error) },
                { status: 500 },
            );
        }
    }

    if (actionName === "audit_twilio_webhooks") {
        try {
            const audit = await auditWorkspaceTwilioWebhooks({
              workspaceId,
            });
            await syncWorkspaceTwilioBootstrapState({ workspaceId });
            return routeData({
              success:
                audit.driftMessages.length === 0
                  ? `No webhook drift. IVR hint: ${audit.ivrRuntimeHint}.`
                  : `Drift found (${audit.driftMessages.length}): ${audit.driftMessages[0]}`,
            });
        } catch (error) {
            logger.error("Twilio webhook audit failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "repair_twilio_webhooks") {
        try {
            const { repaired } = await repairWorkspaceTwilioWebhooks({
              workspaceId,
              actorUserId: user.id,
            });
            return routeData({
              success:
                repaired.length > 0
                  ? `Repaired: ${repaired.join(", ")}`
                  : "Nothing to repair",
            });
        } catch (error) {
            logger.error("Twilio webhook repair failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "run_billing_reconciliation") {
        try {
            const workspace = await getWorkspaceById(workspaceId);

            const creds = readTwilioWorkspaceCredentials(workspace?.twilio_data);
            if (!creds?.sid) {
              return routeData(
                { error: "Workspace has no Twilio credentials" },
                { status: 400 },
              );
            }

            const twilio = await createWorkspaceTwilioInstance({               workspace_id: workspaceId,
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

            return routeData({
              success: snapshot.materialVariance
                ? "Reconciliation complete — material variance detected (see Billing Reconciliation panel)."
                : "Reconciliation complete — no material variance.",
            });
        } catch (error) {
            logger.error("Billing reconciliation run failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "trigger_twilio_open_sync") {
        try {
            const { data, error } = await null.functions.invoke(
              "twilio-open-sync",
              {
                body: {
                  workspaceId,
                  callLimit: 50,
                  messageLimit: 50,
                  maxAgeMinutes: 120,
                },
              },
            );

            if (error) {
              return routeData({ error: error.message }, { status: 500 });
            }

            const summary =
              data && typeof data === "object"
                ? JSON.stringify(data)
                : "Open sync completed";
            return routeData({ success: `Twilio open sync triggered: ${summary}` });
        } catch (error) {
            logger.error("Twilio open sync trigger failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "sync_a2p_status") {
        try {
            await syncWorkspaceA2pStatus({
              workspaceId,
              actorUserId: user.id,
            });
            return routeData({ success: "A2P status synced from Twilio" });
        } catch (error) {
            logger.error("A2P status sync failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "verify_sender_pool") {
        try {
            const result = await verifyWorkspaceMessagingSenderPool({
              workspaceId,
            });
            return routeData({
              success: result.inSync
                ? "Sender pool matches onboarding state"
                : `Sender pool drift: missing ${result.missingFromPool.join(", ") || "none"}; extra ${result.extraInPool.join(", ") || "none"}`,
            });
        } catch (error) {
            logger.error("Sender pool verification failed:", error);
            return routeData({ error: twilioErrorUserMessage(error) }, { status: 500 });
        }
    }

    if (actionName === "provision_workspace_a2p") {
        try {
            await provisionWorkspaceA2P({
                workspaceId,
                actorUserId: user.id,
            });
            return routeData({ success: "Workspace A2P provisioning started" });
        } catch (error) {
            logger.error("Error provisioning workspace A2P:", error);
            return routeData(
                { error: error instanceof Error ? error.message : "Failed to provision workspace A2P" },
                { status: 500 },
            );
        }
    }

    if (actionName === "save_workspace_rcs") {
        try {
            const rcsForm = parseTwilioRcsOnboardingForm(formData);
            await updateWorkspaceRcsOnboarding({
                workspaceId,
                actorUserId: user.id,
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
            return routeData({ success: "Workspace RCS state updated" });
        } catch (error) {
            logger.error("Error updating workspace RCS state:", error);
            return routeData(
                { error: error instanceof Error ? error.message : "Failed to update workspace RCS state" },
                { status: 500 },
            );
        }
    }

    if (actionName !== "update_twilio_portal") {
        return routeData({ error: "Invalid action" }, { status: 400 });
    }

    try {
        const updates = parseTwilioPortalConfigForm(formData);
        await updateWorkspaceTwilioPortalConfig({
            workspaceId,
            actorUserId: user.id,
            actorUsername: userData.username ?? null,
            updates,
        });

        return routeData({ success: "Twilio portal settings updated" });
    } catch (error) {
        logger.error("Error updating Twilio portal settings:", error);
        return routeData(
            { error: error instanceof Error ? error.message : "Failed to update Twilio portal settings" },
            { status: 500 },
        );
    }
};
