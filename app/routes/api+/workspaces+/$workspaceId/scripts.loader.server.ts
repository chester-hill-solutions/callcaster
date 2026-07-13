import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceScriptsApi,
} from "@/lib/platform-data.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: ({ params, context }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    getDataPlaneRouteContext(context, workspaceId);
    return { workspaceId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await listWorkspaceScriptsApi(auth.workspaceId);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ scripts: result.scripts }, 200);
  },
});
