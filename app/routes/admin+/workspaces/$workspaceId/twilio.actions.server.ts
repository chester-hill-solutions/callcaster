import { data as routeData, type ActionFunctionArgs } from "react-router";

import { syncWorkspaceTwilioSnapshot, updateWorkspaceTwilioPortalConfig } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { TWILIO_RCS_PROVIDER, updateWorkspaceRcsOnboarding } from "@/lib/rcs-onboarding.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import type { WorkspaceTwilioOpsConfig } from "@/lib/types";

import { requireSudoAdmin } from "../../requireSudoAdmin.server";

function parseOptionalString(value: FormDataEntryValue | null): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

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
            await ensureWorkspaceTwilioBootstrap({
                supabaseClient,
                workspaceId,
                actorUserId: user.id,
            });
            return routeData({ success: "Workspace messaging bootstrap completed" });
        } catch (error) {
            logger.error("Error bootstrapping workspace messaging:", error);
            return routeData(
                { error: error instanceof Error ? error.message : "Failed to bootstrap workspace messaging" },
                { status: 500 },
            );
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
        await updateWorkspaceTwilioPortalConfig({
            supabaseClient,
            workspaceId,
            actorUserId: user.id,
            actorUsername: userData.username ?? null,
            updates: {
                trafficClass: formData.get("trafficClass") as WorkspaceTwilioOpsConfig["trafficClass"],
                throughputProduct: formData.get("throughputProduct") as WorkspaceTwilioOpsConfig["throughputProduct"],
                multiTenancyMode: formData.get("multiTenancyMode") as WorkspaceTwilioOpsConfig["multiTenancyMode"],
                trafficShapingEnabled: formData.get("trafficShapingEnabled") === "on",
                defaultMessageIntent: parseOptionalString(formData.get("defaultMessageIntent")) as WorkspaceTwilioOpsConfig["defaultMessageIntent"],
                sendMode: formData.get("sendMode") as WorkspaceTwilioOpsConfig["sendMode"],
                messagingServiceSid: parseOptionalString(formData.get("messagingServiceSid")),
                onboardingStatus: formData.get("onboardingStatus") as WorkspaceTwilioOpsConfig["onboardingStatus"],
                supportNotes: typeof formData.get("supportNotes") === "string" ? String(formData.get("supportNotes")) : "",
            },
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
