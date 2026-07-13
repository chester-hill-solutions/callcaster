import { createErrorResponse } from "@/lib/errors.server";
import { listWorkspaceVoicemailsApi } from "@/lib/platform-media.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: ({ params, context }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }
    return { workspaceId, userId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    try {
      const result = await listWorkspaceVoicemailsApi(      auth.userId,
        auth.workspaceId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ voicemails: result.audios }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to list voicemails");
    }
  },
});
