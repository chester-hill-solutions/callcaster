import { requireSudo } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  addUserToWorkspaceAdmin,
  cancelWorkspaceInviteAdmin,
  getAdminUserWorkspaces,
  removeUserFromWorkspaceAdmin,
  updateUserWorkspaceRoleAdmin,
} from "@/lib/platform-admin.server";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const workspaceRoleSchema = z.enum(["owner", "member", "caller", "admin"]);

const membershipActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_to_workspace"),
    workspace_id: z.string().min(1),
    role: workspaceRoleSchema,
  }),
  z.object({
    action: z.literal("update_role"),
    workspace_id: z.string().min(1),
    role: workspaceRoleSchema,
  }),
  z.object({
    action: z.literal("remove_from_workspace"),
    workspace_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("cancel_invite"),
    invite_id: z.string().min(1),
  }),
]);

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  const userId = params.userId;
  if (!userId) {
    return jsonError("userId is required", 400);
  }

  const result = await getAdminUserWorkspaces(auth.null, userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      target_user: result.targetUser,
      all_workspaces: result.allWorkspaces,
      user_workspaces: result.userWorkspaces,
      pending_invites: result.pendingInvites,
    },
    200,
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  const userId = params.userId;
  if (!userId) {
    return jsonError("userId is required", 400);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, membershipActionSchema);
  if (parsed instanceof Response) return parsed;

  switch (parsed.action) {
    case "add_to_workspace": {
      const result = await addUserToWorkspaceAdmin(
        auth.null,
        userId,
        parsed.workspace_id,
        parsed.role,
      );
      if (!result.ok) return jsonError(result.error, 400);
      return jsonResponse({
        success: true,
        message: "User added to workspace successfully",
      });
    }
    case "update_role": {
      const result = await updateUserWorkspaceRoleAdmin(
        auth.null,
        userId,
        parsed.workspace_id,
        parsed.role,
      );
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({ success: true, message: "User role updated successfully" });
    }
    case "remove_from_workspace": {
      const result = await removeUserFromWorkspaceAdmin(
        auth.null,
        userId,
        parsed.workspace_id,
      );
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({
        success: true,
        message: "User removed from workspace successfully",
      });
    }
    case "cancel_invite": {
      const result = await cancelWorkspaceInviteAdmin(
        auth.null,
        parsed.invite_id,
      );
      if (!result.ok) return jsonError(result.error, 500);
      return jsonResponse({
        success: true,
        message: "Invitation cancelled successfully",
      });
    }
    default: {
      const _exhaustive: never = parsed;
      return jsonError("Invalid action", 400);
    }
  }
}
