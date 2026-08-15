import { dataPlaneCapabilityAuthForResource } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getScriptDetailApi } from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthForResource("campaigns.read", "script", "scriptId"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getScriptDetailApi(
      auth.scriptId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ script: result.script }, 200);
  },
});
