import { jsonError, methodNotAllowed } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ params, context }: ActionFunctionArgs) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    getDataPlaneRouteContext(context, workspaceId);

    return { workspaceId };
  },
  sideEffects: ["none"],
  handler: ({ request }) => {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return jsonError("Use GET on this endpoint for billing balance and transactions.", 405);
  },
});
