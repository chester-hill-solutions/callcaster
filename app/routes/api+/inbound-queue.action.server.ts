import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { getUserRole } from "@/lib/database.server";
import {
  addInboundQueueMember,
  createInboundQueue,
  deleteInboundQueue,
  loadInboundQueueSettings,
  removeInboundQueueMember,
  updateInboundQueue,
} from "@/lib/inbound-queue-db.server";
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

  const userRole = await getUserRole({
    supabaseClient,
    user: { id: auth.user.id },
    workspaceId,
  });
  if (!userRole) {
    return jsonError("Not a member", 403);
  }
  if (userRole.role === MemberRole.Caller) {
    return jsonError("Callers cannot manage queues", 403);
  }

  switch (request.method) {
    case "POST": {
      const { name, description, hold_audio } = body;
      if (!name) return jsonError("name required", 400);

      try {
        const queue = await createInboundQueue({
          workspaceId,
          name,
          description,
          hold_audio,
        });
        return jsonResponse({ queue }, 200);
      } catch (error) {
        logger.error("Failed to create queue", error);
        return jsonError(error instanceof Error ? error.message : "Failed to create queue", 500);
      }
    }

    case "PUT": {
      const { id, name, description, hold_audio } = body;
      if (!id) return jsonError("id required", 400);

      try {
        const queue = await updateInboundQueue({
          workspaceId,
          id: Number(id),
          updates: { name, description, hold_audio },
        });
        if (!queue) return jsonError("Queue not found", 404);
        return jsonResponse({ queue }, 200);
      } catch (error) {
        logger.error("Failed to update queue", error);
        return jsonError(error instanceof Error ? error.message : "Failed to update queue", 500);
      }
    }

    case "DELETE": {
      const { id } = body;
      if (!id) return jsonError("id required", 400);

      try {
        await deleteInboundQueue({ workspaceId, id: Number(id) });
        return jsonResponse({ ok: true }, 200);
      } catch (error) {
        logger.error("Failed to delete queue", error);
        return jsonError(error instanceof Error ? error.message : "Failed to delete queue", 500);
      }
    }

    case "PATCH": {
      const { queue_id, user_id, action: memberAction } = body;
      if (!queue_id || !user_id || !memberAction) {
        return jsonError("queue_id, user_id, and action required", 400);
      }

      try {
        if (memberAction === "add") {
          await addInboundQueueMember({
            workspaceId,
            queueId: Number(queue_id),
            userId: user_id,
          });
        } else if (memberAction === "remove") {
          await removeInboundQueueMember({
            workspaceId,
            queueId: Number(queue_id),
            userId: user_id,
          });
        } else {
          return jsonError("action must be 'add' or 'remove'", 400);
        }
        return jsonResponse({ ok: true }, 200);
      } catch (error) {
        logger.error("Failed to update queue member", error);
        return jsonError(error instanceof Error ? error.message : "Failed to update member", 500);
      }
    }

    default:
      return jsonError("Method not allowed", 405);
  }
};
