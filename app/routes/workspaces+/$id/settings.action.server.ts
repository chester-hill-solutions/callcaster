import { data as routeData, redirect } from "react-router";
import {
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleDeleteWorkspace,
  handleTransferWorkspace,
  handleUpdateUser,
  handleUpdateWebhook,
  removeInvite,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { createWorkspaceApiKey } from "@/lib/platform-members.server";
import { MemberRole } from "@/lib/member-role";
import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (!user) {
      return redirect("/signin");
    }

    if (workspaceId == null) {
      return routeData({ error: "No workspace_id found!" }, { headers });
    }

    await requireWorkspaceAccess({ user, workspaceId });
    const role = userRole;

    const formData = await request.formData();
    const formName = formData.get("formName");

    switch (formName) {
      case "addUser":
      case "updateUser":
      case "deleteUser":
      case "cancelInvite":
      case "updateWebhook": {
        if (!hasMinRole(role, MemberRole.Member)) {
          return routeData(
            { error: "You don't have permission to perform this action" },
            { headers, status: 403 },
          );
        }
        break;
      }
      case "createApiKey": {
        if (!hasMinRole(role, MemberRole.Member)) {
          return routeData(
            { error: "You don't have permission to perform this action" },
            { headers, status: 403 },
          );
        }
        break;
      }
      case "transferWorkspaceOwnership":
      case "deleteWorkspace": {
        if (!hasMinRole(role, MemberRole.Owner)) {
          return routeData(
            { error: "Only workspace owners can perform this action" },
            { headers, status: 403 },
          );
        }
        break;
      }
      case "deleteSelf": {
        const userId = formData.get("user_id") as string;
        if (userId !== user.id) {
          return routeData(
            { error: "You don't have permission to perform this action" },
            { headers, status: 403 },
          );
        }
        break;
      }
      default: {
        break;
      }
    }

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
      case "transferWorkspaceOwnership": {
        return handleTransferWorkspace(formData, workspaceId, headers, user.id);
      }
      case "deleteWorkspace": {
        return handleDeleteWorkspace({ workspaceId, headers });
      }
      case "cancelInvite": {
        return removeInvite({ workspaceId, formData, headers });
      }
      case "updateWebhook": {
        return handleUpdateWebhook(formData, workspaceId, headers);
      }
      case "createApiKey": {
        const name = String(formData.get("name") ?? "").trim();
        if (!name) {
          return routeData({ error: "API key name is required" }, { headers, status: 400 });
        }

        const scopes = formData
          .getAll("scopes")
          .map((value) => String(value).trim())
          .filter(Boolean);
        if (scopes.length === 0) {
          return routeData(
            { error: "Select at least one capability scope" },
            { headers, status: 400 },
          );
        }

        const result = await createWorkspaceApiKey(
          user.id,
          workspaceId,
          name,
          scopes,
        );
        if (!result.ok) {
          return routeData({ error: result.error }, { headers, status: result.status });
        }

        return routeData({ key: result.key }, { headers });
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
