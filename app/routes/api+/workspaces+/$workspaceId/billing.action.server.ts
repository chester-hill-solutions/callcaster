import { jsonError, methodNotAllowed } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  getDataPlaneRouteContext(context, workspaceId);

  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  return jsonError("Use GET on this endpoint for billing balance and transactions.", 405);
}
