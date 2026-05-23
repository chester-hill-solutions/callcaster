import { data as routeData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "react-router";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import { SupabaseClient } from "@supabase/supabase-js";
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
import { deepEqual } from "@/lib/utils";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { fetchQueueCounts, getCampaignTableKey, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";

export async function action({ request, params }: ActionFunctionArgs) {




  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
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
        const previousCampaign = await supabaseClient
          .from("campaign")
          .select("type")
          .eq("id", Number(selected_id))
          .single();

        const result = await updateCampaign({
          supabase: supabaseClient,
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

        if (
          previousCampaign.data?.type &&
          previousCampaign.data.type !== nextCampaignData.type
        ) {
          const activeTable = getCampaignTableKey(nextCampaignData.type);
          const tables = ["live_campaign", "message_campaign", "ivr_campaign"] as const;

          await Promise.all(
            tables
              .filter((table) => table !== activeTable)
              .map((table) =>
                supabaseClient.from(table).delete().eq("campaign_id", Number(selected_id)),
              ),
          );
        }

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

          const detailTable = getCampaignTableKey(
            campaignRecord.type as Exclude<Campaign["type"], "email" | null>,
          );
          const { data: campaignDetails, error: detailError } = await supabaseClient
            .from(detailTable)
            .select("*")
            .eq("campaign_id", Number(selected_id))
            .eq("workspace", workspace_id)
            .maybeSingle();

          if (detailError) {
            throw detailError;
          }

          const queueCounts = await fetchQueueCounts(supabaseClient as any, selected_id);
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
        return routeData({ success: true, actionType: "status" as const });
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
