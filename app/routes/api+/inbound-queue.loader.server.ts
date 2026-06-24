import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { getUserRole } from "@/lib/database.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";
import type { Database } from "@/lib/database.types";

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

  const { data: queues } = await supabaseClient
    .from("inbound_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name");

  const queueIds = (queues || []).map((q) => q.id);
  let members: Database["public"]["Tables"]["inbound_queue_member"]["Row"][] = [];
  if (queueIds.length > 0) {
    const { data: memberData } = await supabaseClient
      .from("inbound_queue_member")
      .select("*")
      .in("queue_id", queueIds);
    members = memberData || [];
  }

  const { data: numbers } = await supabaseClient
    .from("workspace_number")
    .select("id, phone_number, friendly_name, inbound_queue_id")
    .eq("workspace", workspaceId);

  return jsonResponse({ queues, members, numbers }, 200);
};
