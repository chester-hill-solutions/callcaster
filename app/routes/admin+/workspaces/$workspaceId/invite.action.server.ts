import { data as routeData } from "react-router";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleUpdateUser,
  removeInvite,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
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

    const { headers, user } = auth;
    const formData = await request.formData();
    const formName = formData.get("formName");

    switch (formName) {
      case "addUser": {
        return handleAddUser(formData, workspaceId, headers);
      }
      case "updateUser": {
        return handleUpdateUser(formData, workspaceId, headers, user.id);
      }
      case "deleteUser": {
        return handleDeleteUser(formData, workspaceId, headers, user.id);
      }
      case "deleteSelf": {
        return handleDeleteSelf(formData, workspaceId, headers, user.id);
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
