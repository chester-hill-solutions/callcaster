import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  listWorkspaceExportsApi,
  startCampaignExportApi,
} from "@/lib/platform-analytics.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { campaignExportBodySchema } from "@/lib/schemas/api/platform-analytics";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    try {
      const result = await listWorkspaceExportsApi(auth.userId, auth.workspaceId);

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ exports: result.exports }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to list exports");
    }
  },
});

export const action = defineAction({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, campaignExportBodySchema);
    if (parsed instanceof Response) return parsed;

    try {
      const result = await startCampaignExportApi(
        auth.userId,
        auth.workspaceId,
        parsed.campaign_id,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(
        {
          export_id: result.export_id,
          status: result.status,
          status_url: result.status_url,
        },
        202,
      );
    } catch (error) {
      return createErrorResponse(error, "Failed to start export");
    }
  },
});
