import { capitalize } from "@/lib/utils";
import { data as routeData } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers } from "@/lib/database.server";
import { handleAddUser, handleDeleteSelf, handleDeleteUser, handleDeleteWorkspace, handleTransferWorkspace, handleUpdateUser, handleUpdateWebhook, removeInvite, testWebhook } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { compareMembersByRole } from "@/lib/workspace-members";
import { MemberRole } from "@/lib/member-role";
import { User, WorkspaceData, WorkspaceInvite, WorkspaceWebhook  } from "@/lib/types";
import { verifyAuth } from "@/lib/auth.server";
import type { ActionFunctionArgs } from "react-router";

type UserWithRole = Partial<User> & { role: string };

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const workspaceId = params.id;
  const { headers, user } = await verifyAuth(request);

  if (workspaceId == null) {
    return routeData({ error: "No workspace_id found!" }, { headers });
  }

  const formData = await request.formData();
  const formName = formData.get("formName");

  switch (formName) {
    case "addUser": {
      return handleAddUser(formData, workspaceId,  headers);
    }
    case "updateUser": {
      return handleUpdateUser(formData, workspaceId,  headers);
    }
    case "deleteUser": {
      return handleDeleteUser(formData, workspaceId,  headers);
    }
    case "deleteSelf": {
      return handleDeleteSelf(formData, workspaceId,  headers);
    }
    case "transferWorkspaceOwnership": {
      return handleTransferWorkspace(
        formData,
        workspaceId,
        headers,
      );
    }
    case "deleteWorkspace": {
      return handleDeleteWorkspace({ workspaceId,  headers });
    }
    case "cancelInvite": {
      return removeInvite({ workspaceId,  formData, headers });
    }
    case "updateWebhook": {
      return handleUpdateWebhook(
        formData,
        workspaceId,
        headers,
      );
    }
    default: {
      break;
    }
  }

  return routeData(
    { data: null, error: "Error: Unrecognized action called" },
    { headers },
  );
}
