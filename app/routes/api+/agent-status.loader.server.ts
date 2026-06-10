import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { getAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";
import { createErrorResponse } from "@/lib/errors.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return routeData({ error: "workspace_id is required" }, { status: 400 });
    }

    await requireWorkspaceAccess({
      supabaseClient: supabase,
      user,
      workspaceId,
    });

    const status = await getAgentStatus(supabase, workspaceId, user.id);
    return routeData({ status });
  } catch (error) {
    logger.error("agent-status loader error:", error);
    return createErrorResponse(error, "Failed to get agent status");
  }
};
