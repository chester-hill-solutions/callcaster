import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceCampaignsApi,
} from "@/lib/platform-data.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  getDataPlaneRouteContext(context, workspaceId);

  const result = await listWorkspaceCampaignsApi(workspaceId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ campaigns: result.campaigns }, 200);
}
