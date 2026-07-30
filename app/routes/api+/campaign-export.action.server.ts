import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { findCampaignExportMeta } from "@/lib/campaign-ivr.server";
import {
  generateCampaignExportId,
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { defineAction } from "@/lib/handler.server";

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

export const action = defineAction({
  auth: async ({ request }) => {
    const auth = await requireDualAuth(request);
    if (auth instanceof Response) return auth;
    const user = getDualAuthUser(auth);
    if (!user) {
      return unauthorized();
    }
    return user;
  },
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth: user }) => {
  try {
    const formData = await request.formData();
    const campaignId = formData.get("campaignId");
    const workspaceId = formData.get("workspaceId");

    if (!campaignId || !workspaceId) {
      return new Response("Missing required parameters", { status: 400 });
    }

    await requireWorkspaceAccess({
      user,
      workspaceId: workspaceId.toString(),
    });

    const campaignRow = await findCampaignExportMeta(
      workspaceId.toString(),
      Number(campaignId),
    );
    if (!campaignRow) {
      return new Response("Campaign not found", { status: 404 });
    }

    const exportId = generateCampaignExportId();

    if (campaignRow.type === "message") {
      void processMessageCampaignExport(
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || "",
      )
        .catch((error: unknown) => {
          logger.error("campaign_export.background_failed", {
            exportId,
            campaignId,
            workspaceId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } else if (campaignRow.type === "live_call" || campaignRow.type === "robocall") {
      void processCallCampaignExport(
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || "",
      )
        .catch((error: unknown) => {
          logger.error("campaign_export.background_failed", {
            exportId,
            campaignId,
            workspaceId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
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
  },
});
