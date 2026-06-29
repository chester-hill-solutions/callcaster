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
import { fetchCampaignDetails, fetchQueueCounts, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import type { ActionFunctionArgs } from "react-router";

type CampaignStatus = "pending" | "scheduled" | "running" | "complete" | "paused" | "draft" | "archived";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

async function updateCampaignStatus(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspaceId: string,
  status: string,
  is_active?: boolean,
) {
  const update: { status: string; is_active?: boolean } = { status };

  if (is_active !== undefined) {
    update.is_active = is_active;
  } else {
    if (status === "running") update.is_active = true;
    if (status === "paused") update.is_active = false;
  }

  logger.debug("Server update object:", update);
  const { error } = await supabaseClient
    .from("campaign")
    .update({ ...update })
    .eq("id", Number(selected_id))
    .eq("workspace", workspaceId);

  if (error) throw error;
  return { success: true };
}

async function handleCampaignDuplicate(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspace_id: string,
  campaignData: string,
) {
  const parsedData = JSON.parse(campaignData);

  const { data: campaign, error } = await supabaseClient
    .from("campaign")
    .insert({
      ...parsedData,
      workspace: workspace_id,
      live_questions: parsedData.live_questions ?? parsedData.questions ?? null,
    })
    .select("id")
    .single();

  if (error || !campaign) throw error || new Error("Failed to create campaign");

  const { data: originalQueue } = await supabaseClient
    .from("campaign_queue")
    .select("contact_id")
    .eq("campaign_id", selected_id);

  if (originalQueue?.length) {
    const newQueueItems = originalQueue.map((item) => ({
      campaign_id: campaign.id,
      contact_id: item.contact_id,
    }));

    const { error: queueError } = await supabaseClient
      .from("campaign_queue")
      .insert(newQueueItems);

    if (queueError) throw queueError;
  }

  return { success: true };
}

export async function action({ request, params }: ActionFunctionArgs) {

  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!selected_id || !workspace_id) return redirect("/");

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
        const result = await updateCampaign({
          campaignData: {
            ...nextCampaignData,
            campaign_id: Number(selected_id),
            workspace: workspace_id,
            schedule: normalizeSchedule(nextCampaignData.schedule),
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
            error: error instanceof Error ? error.message : "Campaign changes could not be saved",
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
        const { data: campaignRecord, error: campaignError } = await supabaseClient
          .from("campaign")
          .select("*")
          .eq("id", Number(selected_id))
          .eq("workspace", workspace_id)
          .single();

        if (campaignError || !campaignRecord) {
          throw campaignError ?? new Error("Campaign could not be loaded");
        }

        if (status === "running" || status === "scheduled") {
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

          const campaignDetails = await fetchCampaignDetails({
            workspaceId: workspace_id,
            campaignId: selected_id,
          });

          const queueCounts = await fetchQueueCounts({
            workspaceId: workspace_id,
            campaignId: selected_id,
            supabaseClient,
          });
          const readiness = getCampaignReadiness(campaignRecord as Campaign, campaignDetails as CampaignDetails, {
            queueCount: queueCounts.queuedCount ?? queueCounts.fullCount ?? 0,
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
          supabaseClient,
          selected_id,
          workspace_id,
          status,
          is_active === "true" ? true : is_active === "false" ? false : undefined
        );
        return routeData({ success: true, actionType: "status" as const, status });
      } catch (error) {
        logger.error("Error updating campaign status", error);
        return routeData(
          {
            success: false,
            error: error instanceof Error ? error.message : "Campaign status could not be updated",
            actionType: "status" as const,
          },
          { status: 400 },
        );
      }
    }

    case "duplicate": {
      try {
        const campaignData = data.campaignData != null ? String(data.campaignData) : "";
        await handleCampaignDuplicate(supabaseClient, selected_id, workspace_id, campaignData);
        return routeData({ success: true, actionType: "duplicate" as const });
      } catch (error) {
        logger.error("Error duplicating campaign", error);
        return routeData(
          {
            success: false,
            error: error instanceof Error ? error.message : "Campaign could not be duplicated",
            actionType: "duplicate" as const,
          },
          { status: 400 },
        );
      }
    }

    default:
      return routeData({ success: false, error: "Invalid intent" }, { status: 400 });
  }
}
