import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }: LoaderFunctionArgs) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ url, auth }) => {
  try {
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return routeData({ error: "workspace_id is required" }, { status: 400 });
    }    await requireWorkspaceAccess({ user: auth.user,
      workspaceId,
    });

    const status = await getAgentStatus(workspaceId, auth.user.id);
    return routeData({ status });
  } catch (error) {
    logger.error("agent-status loader error:", error);
    return createErrorResponse(error, "Failed to get agent status");
  }
  },
});
