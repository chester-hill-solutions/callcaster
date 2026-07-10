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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }


  const result = await listWorkspaceApiKeys(    userId,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ keys: result.keys }, 200);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  if (request.method === "POST") {
    const parsed = await parseJsonBodyOrResponse(request, createApiKeyBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await createWorkspaceApiKey(
      userId,
      workspaceId,
      parsed.name,
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
      },
      201,
    );
  }

  if (request.method === "DELETE") {
    const parsed = await parseJsonBodyOrResponse(request, deleteApiKeyBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await deleteWorkspaceApiKey(
      userId,
      workspaceId,
      parsed.id,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  }

  return jsonError("Method not allowed", 405);
}
