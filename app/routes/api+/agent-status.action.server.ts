import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { safeParseJson } from "@/lib/database.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { updateAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";

type AgentState = Database["public"]["Enums"]["agent_state"];

interface UpdateStatusBody {
  workspace_id: string;
  status: AgentState;
  reason?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await safeParseJson<UpdateStatusBody>(request);
    await requireWorkspaceAccess({
      supabaseClient: supabase,
      user,
      workspaceId: body.workspace_id,
    });

    const result = await updateAgentStatus(
      supabase,
      body.workspace_id,
      user.id,
      body.status,
      body.reason,
    );

    if ("error" in result) {
      return routeData(result, { status: 400 });
    }

    return routeData(result);
  } catch (error) {
    logger.error("agent-status action error:", error);
    return createErrorResponse(error, "Failed to update agent status");
  }
};
