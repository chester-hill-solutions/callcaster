import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { patchNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  deleteWorkspaceNumber,
  patchWorkspaceNumber,
} from "@/lib/platform-workspace-numbers.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ params, context }: Pick<ActionFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    const numberId = params.numberId;
    if (!workspaceId || !numberId) {
      return jsonError("workspaceId and numberId are required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }
    return { workspaceId, numberId, userId };
  },
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const { workspaceId, numberId, userId } = auth;

    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, patchNumberBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await patchWorkspaceNumber(
        userId,
        workspaceId,
        numberId,
        parsed,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ number: result.number }, 200);
    }

    if (request.method === "DELETE") {
      const result = await deleteWorkspaceNumber(
        userId,
        workspaceId,
        numberId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
