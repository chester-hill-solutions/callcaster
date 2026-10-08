import { data as routeData } from "react-router";
import {
  handleAddUser,
  removeInvite,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { removeUserFromWorkspaceAdmin, updateUserWorkspaceRoleAdmin } from "@/lib/platform-admin.server";
import { isMemberRole } from "@/lib/member-role";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: adminRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
    const workspaceId = params.workspaceId;
    if (workspaceId == null) {
      return routeData({ error: "No workspace_id found!" });
    }

    const { headers } = auth;
    const formData = await request.formData();
    const formName = formData.get("formName");

    switch (formName) {
      case "addUser": {
        return handleAddUser(formData, workspaceId, headers, { kind: "platform-admin" });
      }
      case "updateUser": {
        const userId = formData.get("user_id"), role = formData.get("updated_workspace_role");
        if (typeof userId !== "string" || !userId || !isMemberRole(role)) {
          return routeData({ error: "A member and valid workspace role are required" }, { headers, status: 400 });
        }
        const result = await updateUserWorkspaceRoleAdmin(userId, workspaceId, role);
        return result.ok
          ? routeData({ success: true, error: null }, { headers })
          : routeData({ error: result.error }, { headers, status: result.status });
      }
      case "deleteUser": {
        const userId = formData.get("user_id");
        if (typeof userId !== "string" || !userId) {
          return routeData({ error: "A member is required" }, { headers, status: 400 });
        }
        const result = await removeUserFromWorkspaceAdmin(userId, workspaceId);
        return result.ok
          ? routeData({ success: true, error: null }, { headers })
          : routeData({ error: result.error }, { headers, status: result.status });
      }
      case "cancelInvite": {
        return removeInvite({ workspaceId, formData, headers });
      }
      default: {
        break;
      }
    }

    return routeData(
      { data: null, error: "Error: Unrecognized action called" },
      { headers },
    );
  },
});
