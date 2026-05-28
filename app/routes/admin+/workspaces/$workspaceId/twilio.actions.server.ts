import { data as routeData, type ActionFunctionArgs } from "react-router";

import { syncWorkspaceTwilioSnapshot, updateWorkspaceTwilioPortalConfig } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { parseTwilioPortalConfigForm } from "@/lib/schemas/twilio-portal-config";
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

import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import { parseOptionalString } from "@/lib/parse-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { supabaseClient, user, userData } = await requireSudoAdmin(request);

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        return routeData({ error: "Workspace ID is required" }, { status: 400 });
    }

    const formData = await request.formData();
    const actionName = formData.get("_action");

    if (actionName === "sync_twilio_workspace") {
        try {
            await syncWorkspaceTwilioSnapshot({
                supabaseClient,
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
                supabaseClient,
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
              supabaseClient,
              workspaceId,
            });
            await syncWorkspaceTwilioBootstrapState({ supabaseClient, workspaceId });
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
              supabaseClient,
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

    if (actionName === "sync_a2p_status") {
        try {
            await syncWorkspaceA2pStatus({
              supabaseClient,
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
              supabaseClient,
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
                supabaseClient,
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
            await updateWorkspaceRcsOnboarding({
                supabaseClient,
                workspaceId,
                actorUserId: user.id,
                provider: TWILIO_RCS_PROVIDER,
                displayName: typeof formData.get("rcsDisplayName") === "string" ? String(formData.get("rcsDisplayName")) : "",
                publicDescription:
                    typeof formData.get("rcsPublicDescription") === "string"
                        ? String(formData.get("rcsPublicDescription"))
                        : "",
                logoImageUrl:
                    typeof formData.get("rcsLogoImageUrl") === "string"
                        ? String(formData.get("rcsLogoImageUrl"))
                        : "",
                bannerImageUrl:
                    typeof formData.get("rcsBannerImageUrl") === "string"
                        ? String(formData.get("rcsBannerImageUrl"))
                        : "",
                accentColor:
                    typeof formData.get("rcsAccentColor") === "string"
                        ? String(formData.get("rcsAccentColor"))
                        : "",
                optInPolicyImageUrl:
                    typeof formData.get("rcsOptInPolicyImageUrl") === "string"
                        ? String(formData.get("rcsOptInPolicyImageUrl"))
                        : "",
                useCaseVideoUrl:
                    typeof formData.get("rcsUseCaseVideoUrl") === "string"
                        ? String(formData.get("rcsUseCaseVideoUrl"))
                        : "",
                representativeName:
                    typeof formData.get("rcsRepresentativeName") === "string"
                        ? String(formData.get("rcsRepresentativeName"))
                        : "",
                representativeTitle:
                    typeof formData.get("rcsRepresentativeTitle") === "string"
                        ? String(formData.get("rcsRepresentativeTitle"))
                        : "",
                representativeEmail:
                    typeof formData.get("rcsRepresentativeEmail") === "string"
                        ? String(formData.get("rcsRepresentativeEmail"))
                        : "",
                notificationEmail:
                    typeof formData.get("rcsNotificationEmail") === "string"
                        ? String(formData.get("rcsNotificationEmail"))
                        : "",
                agentId: parseOptionalString(formData.get("rcsAgentId")),
                senderId: parseOptionalString(formData.get("rcsSenderId")),
                regions: typeof formData.get("rcsRegions") === "string"
                    ? String(formData.get("rcsRegions"))
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean)
                    : [],
                notes: typeof formData.get("rcsNotes") === "string" ? String(formData.get("rcsNotes")) : "",
                status:
                    formData.get("rcsStatus") === "not_started" ||
                    formData.get("rcsStatus") === "collecting_business" ||
                    formData.get("rcsStatus") === "provisioning" ||
                    formData.get("rcsStatus") === "submitting" ||
                    formData.get("rcsStatus") === "in_review" ||
                    formData.get("rcsStatus") === "approved" ||
                    formData.get("rcsStatus") === "rejected" ||
                    formData.get("rcsStatus") === "live"
                        ? (formData.get("rcsStatus") as "not_started" | "collecting_business" | "provisioning" | "submitting" | "in_review" | "approved" | "rejected" | "live")
                        : "in_review",
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
            supabaseClient,
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
