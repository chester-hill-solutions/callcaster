import { listWorkspaceAuditEventsApi } from "@/lib/platform-audit.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ params, context }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const auth = getDataPlaneRouteContext(context, workspaceId);
    const capability = await requireDataPlaneCapability(auth, "audit.read");
    if (capability instanceof Response) {
      return capability;
    }
    return { workspaceId, userId: auth.userId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const result = await listWorkspaceAuditEventsApi(
      auth.userId,
      auth.workspaceId,
      url.searchParams,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        events: result.events,
        next_cursor: result.next_cursor,
      },
      200,
    );
  },
});
