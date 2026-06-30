import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import {
  addInboundQueueMember,
  createInboundQueue,
  deleteInboundQueue,
  removeInboundQueueMember,
  updateInboundQueue,
} from "@/lib/inbound-queue-db.server";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }

  await requireWorkspaceAccess({ user: { id: user.id }, workspaceId });

  const userRole = await getUserRole({ user, workspaceId });
  if (!userRole || userRole.role === MemberRole.Caller) {
    return routeData({ error: "Not authorized" }, { status: 403, headers });
  }

  const body = await request.json().catch(() => ({}));
  const action = body._action;

  switch (action) {
    case "create-queue": {
      const { name, description } = body;
      if (!name) return routeData({ error: "name required" }, { status: 400, headers });

      try {
        await createInboundQueue({ workspaceId, name, description });
        return routeData({ ok: true }, { headers });
      } catch (error) {
        logger.error("Failed to create queue", error);
        return routeData({ error: error instanceof Error ? error.message : "Failed" }, { status: 500, headers });
      }
    }

    case "update-queue": {
      const { id, name, description } = body;
      if (!id) return routeData({ error: "id required" }, { status: 400, headers });

      try {
        await updateInboundQueue({
          workspaceId,
          id: Number(id),
          updates: { name, description: description || null },
        });
        return routeData({ ok: true }, { headers });
      } catch (error) {
        logger.error("Failed to update queue", error);
        return routeData({ error: error instanceof Error ? error.message : "Failed" }, { status: 500, headers });
      }
    }

    case "delete-queue": {
      const { id } = body;
      if (!id) return routeData({ error: "id required" }, { status: 400, headers });

      try {
        await deleteInboundQueue({ workspaceId, id: Number(id) });
        return routeData({ ok: true }, { headers });
      } catch (error) {
        logger.error("Failed to delete queue", error);
        return routeData({ error: error instanceof Error ? error.message : "Failed" }, { status: 500, headers });
      }
    }

    case "add-member": {
      const { queue_id, user_id } = body;
      if (!queue_id || !user_id) {
        return routeData({ error: "queue_id and user_id required" }, { status: 400, headers });
      }

      try {
        await addInboundQueueMember({
          workspaceId,
          queueId: Number(queue_id),
          userId: user_id,
        });
        return routeData({ ok: true }, { headers });
      } catch (error) {
        logger.error("Failed to add member", error);
        return routeData({ error: error instanceof Error ? error.message : "Failed" }, { status: 500, headers });
      }
    }

    case "remove-member": {
      const { queue_id, user_id } = body;
      if (!queue_id || !user_id) {
        return routeData({ error: "queue_id and user_id required" }, { status: 400, headers });
      }

      try {
        await removeInboundQueueMember({
          workspaceId,
          queueId: Number(queue_id),
          userId: user_id,
        });
        return routeData({ ok: true }, { headers });
      } catch (error) {
        logger.error("Failed to remove member", error);
        return routeData({ error: error instanceof Error ? error.message : "Failed" }, { status: 500, headers });
      }
    }

    default:
      return routeData({ error: "Unknown action" }, { status: 400, headers });
  }
};
