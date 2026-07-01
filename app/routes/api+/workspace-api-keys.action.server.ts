import { requireJsonAuth,
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
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const legacyCreateApiKeySchema = createApiKeyBodySchema.extend({
  workspace_id: z.string().uuid(),
});

const legacyDeleteApiKeySchema = deleteApiKeyBodySchema.extend({
  workspace_id: z.string().uuid(),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) {
    return jsonError("workspace_id is required", 400);
  }

  const result = await listWorkspaceApiKeys(    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ keys: result.keys }, 200);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  if (request.method === "POST") {
    const parsed = await parseJsonBodyOrResponse(request, legacyCreateApiKeySchema);
    if (parsed instanceof Response) return parsed;

    const result = await createWorkspaceApiKey(
      auth.user.id,
      parsed.workspace_id,
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
    const parsed = await parseJsonBodyOrResponse(request, legacyDeleteApiKeySchema);
    if (parsed instanceof Response) return parsed;

    const result = await deleteWorkspaceApiKey(
      auth.user.id,
      parsed.workspace_id,
      parsed.id,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  }

  return jsonError("Method not allowed", 405);
};
