import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  Audience,
  Campaign,
  Script,
  WorkspaceNumbers,
  Schedule,
  WorkspaceData,
  QueueItem,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Survey,
  TwilioAccountData,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { normalizeCampaignData } from "@/lib/campaign-settings";
import { normalizeSchedule } from "@/lib/workspace-members";
import { deepEqual } from "@/lib/utils";
import { parseActionRequest } from "@/lib/request-utils.server";
import {
  findCampaignInWorkspace,
  updateCampaignStatusInWorkspace,
} from "@/lib/campaign-ivr.server";
import {
  splitMessageCampaign,
  fetchCampaignDetails,
  fetchQueueCounts,
  updateCampaign,
} from "@/lib/database/campaign.server";
import { duplicateCampaign } from "@/lib/campaign-duplicate.server";
import {
  getCampaignReadiness,
  getScheduleValidation,
  resolveReadinessQueueCount,
} from "@/lib/campaign-readiness";
import { launchCampaign, isMachineDispatchedVoiceCampaignType } from "@/lib/campaign-execution.server";
import { getWorkspacePhoneNumbers } from "@/lib/database/workspace.server";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import { defineAction } from "@/lib/handler.server";
import { listWorkspaceAudiosApi } from "@/lib/platform-media.server";
import { createTenantDb } from "@/server/tenant-db";
import { MemberRole } from "@/lib/member-role";
import { toUserMessage } from "@/lib/user-message";

type CampaignStatus = "pending" | "scheduled" | "running" | "complete" | "paused" | "draft" | "archived" | "waiting";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

async function updateCampaignStatus(
  workspaceId: string,
  selected_id: string,
  status: string,
) {
  await updateCampaignStatusInWorkspace(workspaceId, Number(selected_id), { status });
  return { success: true };
}

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
  const { id: workspace_id, selected_id } = params;
  const { user, userRole, headers } = auth;

  if (!selected_id || !workspace_id) return redirect("/");

  if (!hasMinRole(userRole, MemberRole.Admin)) {
    return routeData(
      { error: "You don't have permission to perform this action" },
      { headers, status: 403 },
    );
  }

  const data = await parseActionRequest(request);
  const intent = String(data.intent ?? "");

  switch (intent) {
    case "save": {
      try {
        const campaignDataStr = data.campaignData != null ? String(data.campaignData) : "";
        const campaignDetailsStr = data.campaignDetails != null ? String(data.campaignDetails) : "";

        if (!campaignDataStr || !campaignDetailsStr) {
          return routeData(
            { error: "Campaign changes could not be saved", actionType: "save" as const },
            { status: 400 },
          );
        }

        const nextCampaignData = JSON.parse(campaignDataStr);
        const nextCampaignDetails = JSON.parse(campaignDetailsStr);

        const schedule = normalizeSchedule(nextCampaignData.schedule);
        const scheduleValidation = getScheduleValidation(schedule);
        if (scheduleValidation.hasInvalidIntervals) {
          return routeData(
            {
              error:
                "Each active calling day needs at least one valid time window (start and end must be different).",
              actionType: "save" as const,
            },
            { status: 400 },
          );
        }

        const result = await updateCampaign({
          campaignData: {
            ...nextCampaignData,
            campaign_id: Number(selected_id),
            workspace: workspace_id,
            schedule,
            sms_send_window: normalizeSchedule(nextCampaignData.sms_send_window),
          },
          campaignDetails: {
            ...nextCampaignDetails,
            campaign_id: Number(selected_id),
            workspace: workspace_id,
          },
        });

        return routeData({
          success: true,
          actionType: "save" as const,
          campaign: result.campaign,
          campaignDetails: result.campaignDetails,
        });
      } catch (error) {
        logger.error("Error saving campaign settings", error);
        return routeData(
          {
            error: toUserMessage(error, "Campaign changes could not be saved"),
            actionType: "save" as const,
          },
          { status: 400 },
        );
      }
    }

    case "status": {
      try {
        const status = String(data.status ?? "") as CampaignStatus;
        const campaignRecord = await findCampaignInWorkspace(workspace_id, selected_id);

        if (!campaignRecord) {
          throw new Error("Campaign could not be loaded");
        }

        if (status === "running" || status === "waiting" || status === "scheduled") {
          if (
            !campaignRecord.type ||
            !["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
              campaignRecord.type,
            )
          ) {
            return routeData(
              {
                success: false,
                error: "Campaign type must be selected before updating status",
                actionType: "status" as const,
              },
              { status: 400 },
            );
          }

          const tdb = createTenantDb(workspace_id);
          const [campaignDetails, queueCounts, phoneNumbersResult, scripts, audioList] =
            await Promise.all([
              fetchCampaignDetails({
                workspaceId: workspace_id,
                campaignId: selected_id,
              }),
              fetchQueueCounts({
                workspaceId: workspace_id,
                campaignId: selected_id,
              }),
              getWorkspacePhoneNumbers({ workspaceId: workspace_id }),
              tdb.script.findMany({ columns: { id: true } }),
              listWorkspaceAudiosApi(user.id, workspace_id),
            ]);

          // Message and machine-dialled voice campaigns launch through
          // launchCampaign, which validates readiness and enqueues durable
          // dispatch work (#1348). live_call stays human-dialled.
          const launchable =
            campaignRecord.type === "message" ||
            isMachineDispatchedVoiceCampaignType(campaignRecord.type);

          // Full readiness (content + resource availability) for the voice
          // paths; launchCampaign re-validates the campaign-agnostic subset.
          const readiness = getCampaignReadiness(campaignRecord as Campaign, campaignDetails as unknown as CampaignDetails, {
            queueCount: resolveReadinessQueueCount({
              totalCount: queueCounts.fullCount,
              queuedCount: queueCounts.queuedCount,
            }),
            workspacePhoneNumbers: phoneNumbersResult.data ?? [],
            workspaceScriptIds: scripts.map((script) => script.id),
            workspaceAudioNames: audioList.ok
              ? audioList.audios.map((audio) => audio.name)
              : [],
          });
          const readinessError =
            status === "scheduled" ? readiness.scheduleDisabledReason : readiness.startDisabledReason;

          if (launchable && (status === "running" || status === "scheduled")) {
            // Machine-dialled voice launches were previously gated on the full
            // readiness check before any status change — keep that bar.
            if (isMachineDispatchedVoiceCampaignType(campaignRecord.type) && readinessError) {
              return routeData(
                { success: false, error: readinessError, actionType: "status" as const },
                { status: 400 },
              );
            }
            const mode = status === "running" ? "now" : "scheduled";
            const result = await launchCampaign({
              workspaceId: workspace_id,
              campaignId: selected_id,
              campaign: campaignRecord as Campaign,
              campaignDetails: campaignDetails as unknown as CampaignDetails,
              mode,
              userId: user.id,
              queueCount: resolveReadinessQueueCount({
                totalCount: queueCounts.fullCount,
                queuedCount: queueCounts.queuedCount,
              }),
            });
            if (!result.ok) {
              return routeData(
                { success: false, error: result.error, actionType: "status" as const },
                { status: 400 },
              );
            }
            return routeData({ success: true, actionType: "status" as const, status });
          }

          // live_call, email, and waiting-status campaigns: readiness gate,
          // then a simple status update.
          if (readinessError) {
            return routeData(
              { success: false, error: readinessError, actionType: "status" as const },
              { status: 400 },
            );
          }
        }

        // Non-message campaigns or pause/archive/complete go through simple status update.
        if (campaignRecord?.type !== "message" || (status !== "running" && status !== "scheduled")) {
          await updateCampaignStatus(workspace_id, selected_id, status);
        }
        return routeData({ success: true, actionType: "status" as const, status });
      } catch (error) {
        logger.error("Error updating campaign status", error);
        return routeData(
          {
            success: false,
            error: toUserMessage(error, "Campaign status could not be updated"),
            actionType: "status" as const,
          },
          { status: 400 },
        );
      }
    }

    case "duplicate": {
      try {
        const result = await duplicateCampaign({
          workspaceId: workspace_id,
          campaignId: selected_id,
        });
        if (!result.ok) {
          return routeData(
            {
              success: false,
              error: result.error,
              actionType: "duplicate" as const,
            },
            { status: result.status === 404 ? 404 : 400 },
          );
        }
        return routeData({
          success: true,
          actionType: "duplicate" as const,
          campaignId: result.campaignId,
        });
      } catch (error) {
        logger.error("Error duplicating campaign", error);
        return routeData(
          {
            success: false,
            error: toUserMessage(error, "Campaign could not be duplicated"),
            actionType: "duplicate" as const,
          },
          { status: 400 },
        );
      }
    }

    case "split": {
      try {
        const segmentCount = Number(data.segmentCount ?? 0);
        if (!Number.isFinite(segmentCount) || segmentCount < 2) {
          return routeData(
            {
              success: false,
              error: "Choose at least 2 segments to split into",
              actionType: "split" as const,
            },
            { status: 400 },
          );
        }
        const result = await splitMessageCampaign({
          workspaceId: workspace_id,
          sourceCampaignId: selected_id,
          segmentCount,
          userId: user.id,
        });
        return routeData({
          success: true,
          actionType: "split" as const,
          segments: result.segments,
          movedContactCount: result.movedContactCount,
        });
      } catch (error) {
        logger.error("Error splitting campaign", error);
        return routeData(
          {
            success: false,
            error: toUserMessage(error, "Campaign could not be split"),
            actionType: "split" as const,
          },
          { status: 400 },
        );
      }
    }

    default:
      return routeData({ success: false, error: "Invalid intent" }, { status: 400 });
  }
  },
});
