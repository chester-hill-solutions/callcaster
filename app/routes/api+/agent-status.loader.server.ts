import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return routeData({ error: "workspace_id is required" }, { status: 400 });
    }

    const supabase = getAuthSupabaseClient(auth);
    await requireWorkspaceAccess({ supabaseClient: supabase,
      user: auth.user,
      workspaceId,
    });

    const status = await getAgentStatus(workspaceId, auth.user.id);
    return routeData({ status });
  } catch (error) {
    logger.error("agent-status loader error:", error);
    return createErrorResponse(error, "Failed to get agent status");
  }
};
