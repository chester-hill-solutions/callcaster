import { PostgrestError, Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { Audience, WorkspaceData } from "./types";
import { jwtDecode } from "jwt-decode";

export async function getUserWorkspaces({
  supabaseClient,
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  // console.log("Session? ", session);
  if (session == null) {
    return { data: null, error: "No user session found" };
  }

  const workspacesQuery = supabaseClient
    .from("workspace")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error }: { data: WorkspaceData; error: PostgrestError | null } =
    await workspacesQuery;

  if (error) {
    console.log("Error on function getUserWorkspaces: ", error);
  }

  return { data, error };
}

// THIS FUNCTION IS NOW DEPRECATED
export async function createNewWorkspaceDeprecated({
  supabaseClient,
  userId,
  name,
}: {
  supabaseClient: SupabaseClient<Database>;
  userId: string;
  name: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .insert({ owner: userId, name })
    .select("id")
    .single();

  return { data, error };
}

export async function createNewWorkspace({
  supabaseClient,
  workspaceName,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceName: string;
}) {
  const { data: insertWorkspaceData, error: insertWorkspaceError } =
    await supabaseClient.rpc("create_new_workspace", {
      new_workspace_name: workspaceName,
    });
  // console.log("Inside createNewWorkspace: ", insertWorkspaceData);

  if (insertWorkspaceError) {
    return { data: null, error: insertWorkspaceError };
  }

  // const { data: insertWorkspaceUsersData, error: insertWorkspaceUsersError } =
  //   await supabaseClient.from("workspace_users").insert({ workspace });

  return { data: insertWorkspaceData, error: insertWorkspaceError };
}

export async function getWorkspaceInfo({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string | undefined;
}) {
  if (workspaceId == null) return { error: "No workspace id" };

  const { data, error } = await supabaseClient
    .from("workspace")
    .select("name")
    .eq("id", workspaceId)
    .single();

  if (error) {
    console.log(`Error on function getWorkspaceInfo: ${error.details}`);
  }

  return { data, error };
}

export async function getWorkspaceCampaigns({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient.rpc(
    "get_campaigns_by_workspace",
    { workspace_id: workspaceId },
  );

  if (error) {
    console.log("Error on function getWorkspaceCampaigns");
  }

  return { data, error };
}

export async function getWorkspaceUsers({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  // console.log("INSIDE FUNC:", data);
  if (error) {
    console.log("Error on function getWorkspaceUsers", error);
  }

  return { data, error };
}

export async function addUserToWorkspace({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  return;
}

export async function testAuthorize({
  supabaseClient,
  workspaceId,
  permission,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  permission: string;
}) {
  const { data, error } = await supabaseClient.rpc("authorize", {
    selected_workspace_id: workspaceId,
    requested_permission: permission,
  });
  console.log("\nXXXXXXXXXXXXXXXXXXXXXXXXX");
  console.log("Data: ", data);
  console.log("Error: ", error);
  console.log("XXXXXXXXXXXXXXXXXXXXXXXXX");

  return { data, error };
}

export function getUserRole({ serverSession, workspaceId }) {
  if (serverSession == null || serverSession.access_token == null) {
    return null;
  }

  const jwt = jwtDecode(serverSession.access_token);
  const userRole = jwt["user_workspace_roles"]?.find(
    (workspaceRoleObj) => workspaceRoleObj.workspace_id === workspaceId,
  )?.role;

  // console.log("USER ROLE: ", userRole);
  if (userRole == null) {
    console.log("No User Role found on this workspace");
  }

  return userRole;
}

export async function updateUserWorkspaceAccess({
  workspaceId,
  supabaseClient,
}: {
  workspaceId: string;
  supabaseClient: SupabaseClient<Database>;
}): Promise<void> {
  const { data: updatedTime, error: updatedTimeError } =
    await supabaseClient.rpc("update_user_workspace_last_access_time", {
      selected_workspace_id: workspaceId,
    });

  if (updatedTimeError) {
    console.log("Error updating user access time: ", updatedTimeError);
  }

  return;
}
