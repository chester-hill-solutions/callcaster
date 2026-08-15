import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceCallLogApi } from "@/lib/platform-telephony.server";
import { jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    try {
      const result = await getWorkspaceCallLogApi(
        auth.userId,
        auth.workspaceId,
        url.href,
      );

      const { ok: _ok, ...payload } = result;
      return jsonResponse(payload, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to load call log");
    }
  },
});
