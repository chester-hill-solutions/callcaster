import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { updateAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/db-types";

type AgentState = Database["public"]["Enums"]["agent_state"];

interface UpdateStatusBody {
  workspace_id: string;
  status: AgentState;
  reason?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await safeParseJson<UpdateStatusBody>(request);
    await requireWorkspaceAccess({
      user: auth.user,
      workspaceId: body.workspace_id,
    });

    const result = await updateAgentStatus(
      body.workspace_id,
      auth.user.id,
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
