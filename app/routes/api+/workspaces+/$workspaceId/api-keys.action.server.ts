import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  createApiKeyBodySchema,
  deleteApiKeyBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  createWorkspaceApiKey,
  deleteWorkspaceApiKey,
  listWorkspaceApiKeys,
} from "@/lib/platform-members.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

function requireDataPlaneUser({
  params,
  context,
}: LoaderFunctionArgs | ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  return { userId, workspaceId };
}

export const loader = defineLoader({
  auth: requireDataPlaneUser,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await listWorkspaceApiKeys(    auth.userId,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ keys: result.keys }, 200);
  },
});

export const action = defineAction({
  auth: requireDataPlaneUser,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method === "POST") {
      const parsed = await parseJsonBodyOrResponse(request, createApiKeyBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await createWorkspaceApiKey(
        auth.userId,
        auth.workspaceId,
        parsed.name,
        parsed.scopes,
        parsed.expires_in_days,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(
        {
          key: result.key,
          id: result.api_key.id,
          name: result.api_key.name,
          key_prefix: result.api_key.key_prefix,
          created_at: result.api_key.created_at,
          scopes: result.api_key.scopes,
          expires_at: result.api_key.expires_at,
        },
        201,
      );
    }

    if (request.method === "DELETE") {
      const parsed = await parseJsonBodyOrResponse(request, deleteApiKeyBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await deleteWorkspaceApiKey(
        auth.userId,
        auth.workspaceId,
        parsed.id,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
