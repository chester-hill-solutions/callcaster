import { createErrorResponse } from "@/lib/errors.server";
import {
  startCallListeningApi,
  stopCallListeningApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ params, context }: ActionFunctionArgs) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    return { userId, workspaceId };
  },
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    try {
      if (request.method === "POST") {
        const result = await startCallListeningApi(
          { id: auth.userId },
          auth.workspaceId,
        );

        if (!result.ok) {
          return jsonError(result.error, result.status);
        }

        return jsonResponse(
          {
            listening: result.listening,
            token: result.token,
            token_error: result.token_error,
            handset_number: result.handset_number,
            client_identity: result.client_identity,
          },
          200,
        );
      }

      if (request.method === "DELETE") {
        const result = await stopCallListeningApi(
          auth.userId,
          auth.workspaceId,
        );

        return jsonResponse({ listening: result.listening }, 200);
      }

      return jsonError("Method not allowed", 405);
    } catch (error) {
      return createErrorResponse(error, "Failed to update listening state");
    }
  },
});
