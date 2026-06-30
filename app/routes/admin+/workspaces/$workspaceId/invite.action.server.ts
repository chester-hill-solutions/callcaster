import { data as routeData } from "react-router";
import {
  handleAddUser,
  handleDeleteSelf,
  handleDeleteUser,
  handleUpdateUser,
  removeInvite,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { requireSudoOrWorkspaceAdmin } from "../../requireSudoOrWorkspaceAdmin.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const workspaceId = params.workspaceId;
  if (workspaceId == null) {
    return routeData({ error: "No workspace_id found!" });
  }

  const access = await requireSudoOrWorkspaceAdmin(request, workspaceId);
  if (access instanceof Response) {
    return access;
  }

  const { headers } = access;
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
    case "cancelInvite": {
      return removeInvite({ workspaceId,  formData, headers });
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
