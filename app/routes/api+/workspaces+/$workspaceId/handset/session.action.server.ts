import { createErrorResponse } from "@/lib/errors.server";
import {
  deleteHandsetSessionApi,
  getHandsetSessionApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

function requireWorkspaceUser({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }
  return { workspaceId, userId };
}

export const loader = defineLoader({
  auth: requireWorkspaceUser,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    try {
      const result = await getHandsetSessionApi(auth.userId, auth.workspaceId);

      return jsonResponse(
        {
          handset_number: result.handset_number,
          listening: result.listening,
        },
        200,
      );
    } catch (error) {
      return createErrorResponse(error, "Failed to load handset session");
    }
  },
});

export const action = defineAction({
  auth: requireWorkspaceUser,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "DELETE") {
      return jsonError("Method not allowed", 405);
    }

    try {
      const result = await deleteHandsetSessionApi(auth.userId, auth.workspaceId);

      return jsonResponse({ success: result.success }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to end handset session");
    }
  },
});
