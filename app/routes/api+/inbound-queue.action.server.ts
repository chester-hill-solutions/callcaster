import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabaseClient = getAuthSupabaseClient(auth);
  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return jsonError("workspace_id required", 400);
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: auth.user.id },
    workspaceId,
  });

  const userRole = await getUserRole({
    supabaseClient,
    user: { id: auth.user.id },
    workspaceId,
  });
  if (userRole?.role === MemberRole.Caller) {
    return jsonError("Callers cannot manage queues", 403);
  }

  switch (request.method) {
    case "POST": {
      const { name, description, hold_audio } = body;
      if (!name) return jsonError("name required", 400);

      const { data, error } = await supabaseClient
        .from("inbound_queue")
        .insert({
          name,
          description,
          hold_audio: hold_audio || null,
          workspace_id: workspaceId,
        })
        .select()
        .single();

      if (error) {
        logger.error("Failed to create queue", error);
        return jsonError(error.message, 500);
      }
      return jsonResponse({ queue: data }, 200);
    }

    case "PUT": {
      const { id, name, description, hold_audio } = body;
      if (!id) return jsonError("id required", 400);

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
        return jsonError(error.message, 500);
      }
      return jsonResponse({ queue: data }, 200);
    }

    case "DELETE": {
      const { id } = body;
      if (!id) return jsonError("id required", 400);

      const { error } = await supabaseClient
        .from("inbound_queue")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);

      if (error) {
        logger.error("Failed to delete queue", error);
        return jsonError(error.message, 500);
      }
      return jsonResponse({ ok: true }, 200);
    }

    case "PATCH": {
      const { queue_id, user_id, action: memberAction } = body;
      if (!queue_id || !user_id || !memberAction) {
        return jsonError("queue_id, user_id, and action required", 400);
      }

      if (memberAction === "add") {
        const { error } = await supabaseClient
          .from("inbound_queue_member")
          .insert({ queue_id, user_id, workspace_id: workspaceId });
        if (error) {
          logger.error("Failed to add member", error);
          return jsonError(error.message, 500);
        }
      } else if (memberAction === "remove") {
        const { error } = await supabaseClient
          .from("inbound_queue_member")
          .delete()
          .eq("queue_id", queue_id)
          .eq("user_id", user_id);
        if (error) {
          logger.error("Failed to remove member", error);
          return jsonError(error.message, 500);
        }
      } else {
        return jsonError("action must be 'add' or 'remove'", 400);
      }
      return jsonResponse({ ok: true }, 200);
    }

    default:
      return jsonError("Method not allowed", 405);
  }
};
