import type { Database, Tables } from "@/lib/database.types";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, useActionData, useLoaderData } from "react-router";
import { capitalize } from "@/lib/utils";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { handleAddUser, handleDeleteSelf, handleDeleteUser, handleUpdateUser, removeInvite } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";

function compareMembersByRole(a: MemberUser, b: MemberUser) {
  const memberRoleArray = Object.values(MemberRole);

  if (
    memberRoleArray.indexOf(a.role as MemberRole) <
    memberRoleArray.indexOf(b.role as MemberRole)
  )
    return -1;
  if (
    memberRoleArray.indexOf(a.role as MemberRole) >
    memberRoleArray.indexOf(b.role as MemberRole)
  )
    return 1;
  return 0;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {


  const workspaceId = params.workspaceId;
  const { supabaseClient, headers, user } = await verifyAuth(request);

  if (workspaceId == null) {
    return routeData({ error: "No workspace_id found!" }, { headers });
  }

  const { data: userData } = await supabaseClient
    .from("user")
    .select("access_level")
    .eq("id", user?.id)
    .single();

  // Check if user is admin
  const { data: userRoleData } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user?.id)
    .single();

  const hasSudoAccess = userData?.access_level === "sudo";
  const hasWorkspaceAdminAccess = userRoleData?.role === "admin" || userRoleData?.role === "owner";

  if (!hasSudoAccess && !hasWorkspaceAdminAccess) {
    return routeData({ error: "Unauthorized" }, { status: 403, headers });
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
    case "cancelInvite": {
      return removeInvite({ workspaceId, supabaseClient, formData, headers });
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
