import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  listWorkspaceExportsApi,
  startCampaignExportApi,
} from "@/lib/platform-analytics.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { campaignExportBodySchema } from "@/lib/schemas/api/platform-analytics";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const result = await listWorkspaceExportsApi(userId, workspaceId);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ exports: result.exports }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to list exports");
  }
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, campaignExportBodySchema);
  if (parsed instanceof Response) return parsed;

  try {
    const result = await startCampaignExportApi(
      userId,
      workspaceId,
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
}
