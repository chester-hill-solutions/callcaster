import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { transferOwnershipBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { transferWorkspaceOwnershipApi } from "@/lib/platform-workspace.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const parsed = await parseJsonBodyOrResponse(
    request,
    transferOwnershipBodySchema,
  );
  if (parsed instanceof Response) return parsed;

  const { headers } = createSupabaseServerClient(request);
  const result = await transferWorkspaceOwnershipApi(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
    parsed.new_owner_user_id,
    headers,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    { success: true, new_owner_user_id: result.new_owner_user_id },
    200,
  );
}
