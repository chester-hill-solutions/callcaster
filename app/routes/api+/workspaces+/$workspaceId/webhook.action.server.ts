import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  testWebhookBodySchema,
  upsertWebhookBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  getWorkspaceWebhook,
  testWorkspaceWebhook,
  upsertWorkspaceWebhook,
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

  const result = await getWorkspaceWebhook(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ webhook: result.webhook }, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const supabase = getAuthSupabaseClient(auth);

  if (request.method === "PUT") {
    const parsed = await parseJsonBodyOrResponse(request, upsertWebhookBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await upsertWorkspaceWebhook(
      supabase,
      auth.user.id,
      workspaceId,
      parsed,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ webhook: result.webhook }, 200);
  }

  if (request.method === "POST") {
    const parsed = await parseJsonBodyOrResponse(request, testWebhookBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await testWorkspaceWebhook(
      parsed.destination_url,
      parsed.custom_headers as Record<string, string> | [string, string][],
      parsed.event,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        data: result.data,
        status: result.status,
        statusText: result.statusText,
      },
      200,
    );
  }

  return jsonError("Method not allowed", 405);
}
