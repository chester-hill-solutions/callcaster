import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const result = await listWorkspaceApiKeys(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ keys: result.keys }, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const supabase = getAuthSupabaseClient(auth);

  if (request.method === "POST") {
    const parsed = await parseJsonBodyOrResponse(request, createApiKeyBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await createWorkspaceApiKey(
      supabase,
      auth.user.id,
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
      supabase,
      auth.user.id,
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
