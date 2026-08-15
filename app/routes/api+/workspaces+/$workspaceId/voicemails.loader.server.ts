import { createErrorResponse } from "@/lib/errors.server";
import { listWorkspaceVoicemailsApi } from "@/lib/platform-media.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
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
