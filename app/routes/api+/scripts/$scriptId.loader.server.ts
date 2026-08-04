import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { authForResource, getScriptDetailApi } from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ request, params }: LoaderFunctionArgs) => {
    const scriptId = params.scriptId;
    if (!scriptId) {
      return jsonError("scriptId is required", 400);
    }

    const auth = await authForResource(request, "script", scriptId);
    if (auth instanceof Response) return auth;

    const capability = await requireDataPlaneCapability(auth, "campaigns.read");
    if (capability instanceof Response) return capability;

    return { ...auth, scriptId };
  },
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
