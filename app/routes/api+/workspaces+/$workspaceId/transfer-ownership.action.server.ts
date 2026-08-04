import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { transferOwnershipBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { transferWorkspaceOwnershipApi } from "@/lib/platform-workspace.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ params, context }: Pick<ActionFunctionArgs, "params" | "context">) => {
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
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(
      request,
      transferOwnershipBodySchema,
    );
    if (parsed instanceof Response) return parsed;

    const result = await transferWorkspaceOwnershipApi(
      auth.userId,
      auth.workspaceId,
      parsed.new_owner_user_id,
      new Headers(),
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      { success: true, new_owner_user_id: result.new_owner_user_id },
      200,
    );
  },
});
