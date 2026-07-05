import { data as routeData, redirect } from "react-router";
import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
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
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/auth.server";
import { hasMinRole } from "@/lib/workspace-route.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.id;
  const { headers, user } = await verifyAuth(request);

  if (!user) {
    return redirect("/signin");
  }

  if (workspaceId == null) {
    return routeData({ error: "No workspace_id found!" }, { headers });
  }

  await requireWorkspaceAccess({ user, workspaceId });

  const userRole = await getUserRole({ user, workspaceId });
  const role = userRole?.role;

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
    default: {
      break;
    }
  }

  return routeData(
    { data: null, error: "Error: Unrecognized action called" },
    { headers },
  );
};
