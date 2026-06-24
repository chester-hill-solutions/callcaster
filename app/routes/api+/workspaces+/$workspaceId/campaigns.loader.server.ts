import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceCampaignsApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const result = await listWorkspaceCampaignsApi(auth.supabase, workspaceId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ campaigns: result.campaigns }, 200);
}
