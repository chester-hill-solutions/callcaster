import { requireSudo } from "@/lib/api-auth.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
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

export const loader = defineLoader({
  auth: async ({ request, params }: LoaderFunctionArgs) => {
    const auth = await requireSudo(request);
    if (auth instanceof Response) return auth;

    const userId = params.userId;
    if (!userId) {
      return jsonError("userId is required", 400);
    }

    return { ...auth, userId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getAdminUserWorkspaces(auth.userId);
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
  },
});

export const action = defineAction({
  auth: async ({ request, params }: ActionFunctionArgs) => {
    const auth = await requireSudo(request);
    if (auth instanceof Response) return auth;

    const userId = params.userId;
    if (!userId) {
      return jsonError("userId is required", 400);
    }

    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    return { ...auth, userId };
  },
  input: membershipActionSchema,
  sideEffects: ["db-write"],
  handler: async ({ auth, input }) => {
    const userId = auth.userId;

    switch (input.action) {
      case "add_to_workspace": {
        const result = await addUserToWorkspaceAdmin(
          userId,
          input.workspace_id,
          input.role,
        );
        if (!result.ok) return jsonError(result.error, 400);
        return jsonResponse({
          success: true,
          message: "User added to workspace successfully",
        });
      }
      case "update_role": {
        const result = await updateUserWorkspaceRoleAdmin(
          userId,
          input.workspace_id,
          input.role,
        );
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({ success: true, message: "User role updated successfully" });
      }
      case "remove_from_workspace": {
        const result = await removeUserFromWorkspaceAdmin(
          userId,
          input.workspace_id,
        );
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({
          success: true,
          message: "User removed from workspace successfully",
        });
      }
      case "cancel_invite": {
        const result = await cancelWorkspaceInviteAdmin(
          input.invite_id,
        );
        if (!result.ok) return jsonError(result.error, 500);
        return jsonResponse({
          success: true,
          message: "Invitation cancelled successfully",
        });
      }
      default: {
        const _exhaustive: never = input;
        return jsonError("Invalid action", 400);
      }
    }
  },
});
