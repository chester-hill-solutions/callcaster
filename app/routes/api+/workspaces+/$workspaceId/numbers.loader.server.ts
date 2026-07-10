import { listWorkspaceNumbers } from "@/lib/platform-workspace-numbers.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }


  const result = await listWorkspaceNumbers(    userId,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ numbers: result.numbers }, 200);
}
