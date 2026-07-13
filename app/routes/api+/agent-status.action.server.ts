import { data as routeData } from "react-router";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { defineAction } from "@/lib/handler.server";
import { createErrorResponse } from "@/lib/errors.server";
import { updateAgentStatus } from "@/lib/agent-status.server";
import { logger } from "@/lib/logger.server";
import { z } from "zod";
import { agent_state } from "@/db/schema";

const updateStatusSchema = z.object({
  workspace_id: z.string(),
  status: z.enum(agent_state.enumValues),
  reason: z.string().optional(),
});

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  input: updateStatusSchema,
  sideEffects: ["db-write"],
  handler: async ({ auth, input }) => {
    try {
      await requireWorkspaceAccess({
        user: auth.user,
        workspaceId: input.workspace_id,
      });

      const result = await updateAgentStatus(
        input.workspace_id,
        auth.user.id,
        input.status,
        input.reason,
      );

      if ("error" in result) {
        return routeData(result, { status: 400 });
      }

      return routeData(result);
    } catch (error) {
      logger.error("agent-status action error:", error);
      return createErrorResponse(error, "Failed to update agent status");
    }
  },
});
