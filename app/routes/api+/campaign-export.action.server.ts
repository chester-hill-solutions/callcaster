import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { findCampaignExportMeta } from "@/lib/campaign-ivr.server";
import {
  generateCampaignExportId,
  processCampaignSmsReportExport,
  processCallCampaignExport,
  processMessageCampaignExport,
} from "@/lib/campaign-export.server";
import { defineAction } from "@/lib/handler.server";
import { trackBackgroundFailure } from "@/lib/background-task.server";
import { toUserMessage } from "@/lib/user-message";
import { isMachineDispatchedVoiceCampaignType } from "@/lib/campaign-execution.server";

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

type CampaignExportMeta = NonNullable<
  Awaited<ReturnType<typeof findCampaignExportMeta>>
>;

function requestSmsReport(
  campaignRow: CampaignExportMeta,
  workspaceId: string,
  campaignId: number,
) {
  if (
    campaignRow.type !== "message" ||
    campaignRow.status !== "complete" ||
    campaignRow.is_sample ||
    /(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(campaignRow.title || "")
  ) {
    return routeData(
      { error: "Only completed, non-test message campaigns can have a report" },
      { status: 400 },
    );
  }

  const exportId = generateCampaignExportId();
  trackBackgroundFailure(
    processCampaignSmsReportExport(
      campaignId,
      workspaceId,
      exportId,
      campaignRow.title || "",
    ),
    "campaign_export.sms_report_failed",
    { exportId, campaignId, workspaceId },
  );
  return routeData({
    exportId,
    status: "started",
    statusUrl: `/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`,
  });
}

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
      const exportType = formData.get("exportType");

      if (!campaignId || !workspaceId) {
        return new Response("Missing required parameters", { status: 400 });
      }
      if (exportType != null && exportType !== "sms-report") {
        return routeData({ error: "Invalid export type" }, { status: 400 });
      }

      await requireWorkspaceAccess({
        user,
        workspaceId: workspaceId.toString(),
        ...(exportType === "sms-report" ? { minRole: "admin" } : {}),
      });

      const numericCampaignId = Number(campaignId);
      if (!Number.isSafeInteger(numericCampaignId) || numericCampaignId < 1) {
        return routeData({ error: "Invalid campaign ID" }, { status: 400 });
      }

      const campaignRow = await findCampaignExportMeta(
        workspaceId.toString(),
        numericCampaignId,
      );
      if (!campaignRow) {
        return new Response("Campaign not found", { status: 404 });
      }

      if (exportType === "sms-report") {
        return requestSmsReport(
          campaignRow,
          workspaceId.toString(),
          numericCampaignId,
        );
      }

      const exportId = generateCampaignExportId();

      if (campaignRow.type === "message") {
        trackBackgroundFailure(
          processMessageCampaignExport(
            numericCampaignId,
            workspaceId.toString(),
            exportId,
            campaignRow.title || "",
          ),
          "campaign_export.background_failed",
          { exportId, campaignId, workspaceId },
        );
      } else if (
        campaignRow.type === "live_call" ||
        isMachineDispatchedVoiceCampaignType(campaignRow.type)
      ) {
        trackBackgroundFailure(
          processCallCampaignExport(
            numericCampaignId,
            workspaceId.toString(),
            exportId,
            campaignRow.title || "",
          ),
          "campaign_export.background_failed",
          { exportId, campaignId, workspaceId },
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
          error: toUserMessage(error, "Unknown error"),
        },
        { status: 500 },
      );
    }
  },
});
