import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { getUserRole } from "@/lib/database.server";
import { loadInboundQueueSettings } from "@/lib/inbound-queue-db.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabaseClient = getAuthSupabaseClient(auth);
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id") || params.id;
  if (!workspaceId) {
    return jsonError("workspace_id required", 400);
  }

  const userRole = await getUserRole({
    supabaseClient,
    user: { id: auth.user.id },
    workspaceId,
  });
  if (!userRole) {
    return jsonError("Not a member", 403);
  }

  const { queues, members, numbers } = await loadInboundQueueSettings(workspaceId);

  return jsonResponse({ queues, members, numbers }, 200);
};
