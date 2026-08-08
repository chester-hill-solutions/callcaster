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
  insertCampaignForWorkspace,
  updateCampaignStatusInWorkspace,
} from "@/lib/campaign-ivr.server";
import { getCampaignQueueContactIds } from "@/lib/campaign-queue-db.server";
import {
  splitMessageCampaign,
  fetchCampaignDetails,
  fetchQueueCounts,
  updateCampaign,
} from "@/lib/database/campaign.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { getCampaignReadiness, getScheduleValidation } from "@/lib/campaign-readiness";
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
  is_active?: boolean,
) {
  const update: { status: string; is_active?: boolean } = { status };

  if (is_active !== undefined) {
    update.is_active = is_active;
  } else {
    if (status === "running" || status === "waiting") update.is_active = true;
    if (status === "paused") update.is_active = false;
  }

  logger.debug("Server update object:", update);
  await updateCampaignStatusInWorkspace(workspaceId, Number(selected_id), update);
  return { success: true };
}

async function handleCampaignDuplicate(
  selected_id: string,
  workspace_id: string,
  campaignData: string,
) {
  const parsedData = JSON.parse(campaignData);

  // Don't trust the client's (possibly stale/edited) draft for the script
  // reference — read the source campaign's real script_id off the DB so the
  // duplicate always points at a script that actually exists in this
  // workspace. Null it out if the source has none.
  const sourceCampaign = await findCampaignInWorkspace(workspace_id, selected_id);

  const campaign = await insertCampaignForWorkspace(workspace_id, {
    ...parsedData,
    script_id: sourceCampaign?.script_id ?? null,
    live_questions: parsedData.live_questions ?? parsedData.questions ?? null,
  });

  const originalContactIds = await getCampaignQueueContactIds(Number(selected_id));

  if (originalContactIds.length > 0) {
    await enqueueContactsForCampaign(
      campaign.id,
      originalContactIds,
      { requeue: false },
    );
  }

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
        const is_active = String(data.is_active ?? "");
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
          const readiness = getCampaignReadiness(campaignRecord as Campaign, campaignDetails as unknown as CampaignDetails, {
            queueCount: queueCounts.queuedCount ?? queueCounts.fullCount ?? 0,
            workspacePhoneNumbers: phoneNumbersResult.data ?? [],
            workspaceScriptIds: scripts.map((script) => script.id),
            workspaceAudioNames: audioList.ok
              ? audioList.audios.map((audio) => audio.name)
              : [],
          });
          const readinessError =
            status === "scheduled" ? readiness.scheduleDisabledReason : readiness.startDisabledReason;

          if (readinessError) {
            return routeData(
              { success: false, error: readinessError, actionType: "status" as const },
              { status: 400 },
            );
          }
        }

        await updateCampaignStatus(
          workspace_id,
          selected_id,
          status,
          is_active === "true" ? true : is_active === "false" ? false : undefined
        );
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
        const campaignData = data.campaignData != null ? String(data.campaignData) : "";
        await handleCampaignDuplicate(selected_id, workspace_id, campaignData);
        return routeData({ success: true, actionType: "duplicate" as const });
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
