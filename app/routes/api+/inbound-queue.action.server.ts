import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user) return routeData({ error: "Unauthorized" }, { status: 401, headers });

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id;
  if (!workspaceId) return routeData({ error: "workspace_id required" }, { status: 400, headers });

  await requireWorkspaceAccess({ supabaseClient, user: { id: user.id }, workspaceId });

  const userRole = await getUserRole({ supabaseClient, user, workspaceId });
  if (userRole?.role === MemberRole.Caller) {
    return routeData({ error: "Callers cannot manage queues" }, { status: 403, headers });
  }

  switch (request.method) {
    case "POST": {
      const { name, description, hold_audio } = body;
      if (!name) return routeData({ error: "name required" }, { status: 400, headers });

      const { data, error } = await supabaseClient
        .from("inbound_queue")
        .insert({ name, description, hold_audio: hold_audio || null, workspace_id: workspaceId })
        .select()
        .single();

      if (error) {
        logger.error("Failed to create queue", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ queue: data }, { headers });
    }

    case "PUT": {
      const { id, name, description, hold_audio } = body;
      if (!id) return routeData({ error: "id required" }, { status: 400, headers });

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (hold_audio !== undefined) updates.hold_audio = hold_audio;

      const { data, error } = await supabaseClient
        .from("inbound_queue")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();

      if (error) {
        logger.error("Failed to update queue", error);
        return routeData({ error: error.message }, { status: 500, headers });
      }
      return routeData({ queue: data }, { headers });
    }

    case "DELETE": {
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

    case "PATCH": {
      // Add or remove member from queue
      const { queue_id, user_id, action: memberAction } = body;
      if (!queue_id || !user_id || !memberAction) {
        return routeData({ error: "queue_id, user_id, and action required" }, { status: 400, headers });
      }

      if (memberAction === "add") {
        const { error } = await supabaseClient
          .from("inbound_queue_member")
          .insert({ queue_id, user_id, workspace_id: workspaceId });
        if (error) {
          logger.error("Failed to add member", error);
          return routeData({ error: error.message }, { status: 500, headers });
        }
      } else if (memberAction === "remove") {
        const { error } = await supabaseClient
          .from("inbound_queue_member")
          .delete()
          .eq("queue_id", queue_id)
          .eq("user_id", user_id);
        if (error) {
          logger.error("Failed to remove member", error);
          return routeData({ error: error.message }, { status: 500, headers });
        }
      } else {
        return routeData({ error: "action must be 'add' or 'remove'" }, { status: 400, headers });
      }
      return routeData({ ok: true }, { headers });
    }

    default:
      return routeData({ error: "Method not allowed" }, { status: 405, headers });
  }
};
