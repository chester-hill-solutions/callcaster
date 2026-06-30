import { data as routeData } from "react-router";
import {
  addUserToWorkspaceAdmin,
  cancelWorkspaceInviteAdmin,
  removeUserFromWorkspaceAdmin,
  updateUserWorkspaceRoleAdmin,
} from "@/lib/platform-admin.server";
import { MemberRole } from "@/lib/member-role";
import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import type { ActionFunctionArgs } from "react-router";

type WorkspaceRole = "owner" | "member" | "caller" | "admin";

function parseWorkspaceRole(value: FormDataEntryValue | null): WorkspaceRole | null {
  if (typeof value !== "string") return null;
  if (Object.values(MemberRole).includes(value as MemberRole)) {
    return value as WorkspaceRole;
  }
  return null;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient } = await requireSudoAdmin(request);
  const userId = params.userId;

  if (!userId) {
    return routeData({ error: "User ID is required" });
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "add_to_workspace") {
    const workspaceId = formData.get("workspaceId") as string;
    const role = parseWorkspaceRole(formData.get("role"));

    if (!workspaceId) {
      return routeData({ error: "Workspace is required" });
    }

    if (!role) {
      return routeData({ error: "Role is required" });
    }

    const result = await addUserToWorkspaceAdmin(supabaseClient, userId, workspaceId, role);
    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "User added to workspace successfully" });
  }

  if (actionType === "update_role") {
    const workspaceId = formData.get("workspaceId") as string;
    const role = parseWorkspaceRole(formData.get("role"));

    if (!workspaceId || !role) {
      return routeData({ error: "Workspace and role are required" });
    }

    const result = await updateUserWorkspaceRoleAdmin(
      supabaseClient,
      userId,
      workspaceId,
      role,
    );
    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "User role updated successfully" });
  }

  if (actionType === "remove_from_workspace") {
    const workspaceId = formData.get("workspaceId") as string;

    if (!workspaceId) {
      return routeData({ error: "Workspace ID is required" });
    }

    const result = await removeUserFromWorkspaceAdmin(supabaseClient, userId, workspaceId);
    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "User removed from workspace successfully" });
  }

  if (actionType === "cancel_invite") {
    const inviteId = formData.get("inviteId") as string;

    if (!inviteId) {
      return routeData({ error: "Invite ID is required" });
    }

    const result = await cancelWorkspaceInviteAdmin(supabaseClient, inviteId);
    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "Invitation cancelled successfully" });
  }

  return routeData({ error: "Invalid action" });
};
