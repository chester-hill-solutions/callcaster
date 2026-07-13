import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { getSession } from "@/lib/auth.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { updateWorkspaceBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  deleteWorkspaceApi,
  getWorkspaceDetailForDataPlane,
  updateWorkspaceName,
} from "@/lib/platform-workspace.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

function resolveDataPlaneWorkspaceAuth({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const auth = getDataPlaneRouteContext(context, workspaceId);
  return { workspaceId, auth };
}

function requireSessionUser(
  args: Pick<ActionFunctionArgs, "params" | "context">,
) {
  const resolved = resolveDataPlaneWorkspaceAuth(args);
  if (resolved instanceof Response) {
    return resolved;
  }
  if (!resolved.auth.userId) {
    return jsonError("Unauthorized", 401);
  }
  return { workspaceId: resolved.workspaceId, userId: resolved.auth.userId };
}

export const loader = defineLoader({
  auth: resolveDataPlaneWorkspaceAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceDetailForDataPlane(
      auth.auth.userId,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ workspace: result.workspace }, 200);
  },
});

export const action = defineAction({
  auth: requireSessionUser,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers } = await getSession(request);
    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, updateWorkspaceBodySchema);
      if (parsed instanceof Response) return parsed;

      if (!parsed.name) {
        return jsonError("name is required", 400);
      }

      const result = await updateWorkspaceName(
        auth.userId,
        auth.workspaceId,
        parsed.name,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ workspace: result.workspace }, 200);
    }

    if (request.method === "DELETE") {
      const result = await deleteWorkspaceApi(
        auth.userId,
        auth.workspaceId,
        headers,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
