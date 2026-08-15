import { createErrorResponse } from "@/lib/errors.server";
import {
  deleteHandsetSessionApi,
  getHandsetSessionApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
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
  auth: dataPlaneSessionAuth(),
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
