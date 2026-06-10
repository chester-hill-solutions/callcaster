import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }

  await requireWorkspaceAccess({ supabaseClient, user: { id: user.id }, workspaceId });

  const userRole = await getUserRole({ supabaseClient, user, workspaceId });
  if (!userRole || userRole.role === MemberRole.Caller) {
    return routeData({ error: "Not authorized" }, { status: 403, headers });
  }

  const body = await request.json().catch(() => ({}));
  const action = body._action;

  switch (action) {
    case "create-queue": {
      const { name, description } = body;
      if (!name) return routeData({ error: "name required" }, { status: 400, headers });

      const { error } = await supabaseClient
        .from("inbound_queue")
        .insert({ name, description: description || null, workspace_id: workspaceId });

      if (error) {
        logger.error("Failed to create queue", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    case "update-queue": {
      const { id, name, description } = body;
      if (!id) return routeData({ error: "id required" }, { status: 400, headers });

      const { error } = await supabaseClient
        .from("inbound_queue")
        .update({ name, description: description || null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId);

      if (error) {
        logger.error("Failed to update queue", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    case "delete-queue": {
      const { id } = body;
      if (!id) return routeData({ error: "id required" }, { status: 400, headers });

      const { error } = await supabaseClient
        .from("inbound_queue")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);

      if (error) {
        logger.error("Failed to delete queue", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    case "add-member": {
      const { queue_id, user_id } = body;
      if (!queue_id || !user_id) {
        return routeData({ error: "queue_id and user_id required" }, { status: 400, headers });
      }

      const { error } = await supabaseClient
        .from("inbound_queue_member")
        .insert({ queue_id: Number(queue_id), user_id, workspace_id: workspaceId });

      if (error) {
        logger.error("Failed to add member", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    case "remove-member": {
      const { queue_id, user_id } = body;
      if (!queue_id || !user_id) {
        return routeData({ error: "queue_id and user_id required" }, { status: 400, headers });
      }

      const { error } = await supabaseClient
        .from("inbound_queue_member")
        .delete()
        .eq("queue_id", Number(queue_id))
        .eq("user_id", user_id);

      if (error) {
        logger.error("Failed to remove member", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    default:
      return routeData({ error: "Unknown action" }, { status: 400, headers });
  }
};
