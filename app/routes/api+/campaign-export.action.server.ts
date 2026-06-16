import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import {
  generateCampaignExportId,
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const campaignId = formData.get("campaignId");
    const workspaceId = formData.get("workspaceId");

    if (!campaignId || !workspaceId) {
      return new Response("Missing required parameters", { status: 400 });
    }

    await requireWorkspaceAccess({
      supabaseClient,
      user,
      workspaceId: workspaceId.toString(),
    });

    const { data: campaignRow, error: campaignRowError } = await supabaseClient
      .from("campaign")
      .select("id, type, title, workspace")
      .eq("id", Number(campaignId))
      .single();
    if (campaignRowError || !campaignRow) {
      return new Response("Campaign not found", { status: 404 });
    }
    if (campaignRow.workspace !== workspaceId.toString()) {
      return new Response("Forbidden", { status: 403 });
    }

    const exportId = generateCampaignExportId();

    if (campaignRow.type === "message") {
      void processMessageCampaignExport(
        supabaseClient,
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || "",
      );
    } else if (campaignRow.type === "live_call" || campaignRow.type === "robocall") {
      void processCallCampaignExport(
        supabaseClient,
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || "",
      );
    } else {
      return new Response("Invalid campaign type", { status: 400 });
    }

    return routeData({
      exportId,
      status: "started",
      statusUrl: `/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`,
    });
  } catch (error) {
    logger.error("Export request error:", error);
    return routeData(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};
