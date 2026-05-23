import { capitalize } from "@/lib/utils";
import { data as routeData } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers } from "@/lib/database.server";
import { handleAddUser, handleDeleteSelf, handleDeleteUser, handleDeleteWorkspace, handleTransferWorkspace, handleUpdateUser, handleUpdateWebhook, removeInvite, testWebhook } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { MemberRole } from "@/lib/member-role";
import { User, WorkspaceData, WorkspaceInvite, WorkspaceWebhook  } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

function compareMembersByRole(a: UserWithRole, b: UserWithRole  ) {
  const memberRoleArray = Object.values(MemberRole);

  const aRole = a.role as MemberRole;
  const bRole = b.role as MemberRole;

  if (
    memberRoleArray.indexOf(aRole) <
    memberRoleArray.indexOf(bRole)
  )
    return -1;
  if (
    memberRoleArray.indexOf(aRole) >
    memberRoleArray.indexOf(bRole)
  )
    return 1;
  return 0;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const workspaceId = params.id;
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (workspaceId == null) {
    return routeData({ error: "No workspace_id found!" }, { headers });
  }

  const formData = await request.formData();
  const formName = formData.get("formName");

  switch (formName) {
    case "addUser": {
      return handleAddUser(formData, workspaceId, supabaseClient, headers);
    }
    case "updateUser": {
      return handleUpdateUser(formData, workspaceId, supabaseClient, headers);
    }
    case "deleteUser": {
      return handleDeleteUser(formData, workspaceId, supabaseClient, headers);
    }
    case "deleteSelf": {
      return handleDeleteSelf(formData, workspaceId, supabaseClient, headers);
    }
    case "transferWorkspaceOwnership": {
      return handleTransferWorkspace(
        formData,
        workspaceId,
        supabaseClient,
        headers,
      );
    }
    case "deleteWorkspace": {
      return handleDeleteWorkspace({ workspaceId, supabaseClient, headers });
    }
    case "cancelInvite": {
      return removeInvite({ workspaceId, supabaseClient, formData, headers });
    }
    case "updateWebhook": {
      return handleUpdateWebhook(
        formData,
        workspaceId,
        supabaseClient,
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
