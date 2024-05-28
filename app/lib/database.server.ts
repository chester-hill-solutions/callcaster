import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { Audience, WorkspaceData } from "./types";

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

export async function createNewWorkspace({
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
    .insert({ owner: userId, name, users: [userId] })
    .select("id")
    .single();

  return { data, error };
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
    console.log("Error on function getWorkspaceInfo");
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
    console.log("Error on function getWorkspaceAudiences");
  }

  return { data, error };
}

// export async function getWorkspaceAudiencesByCampaign({
//   supabaseClient,
//   campaignId,
// }: {
//   supabaseClient: SupabaseClient<Database>;
//   campaignId: number;
// }) {
//   const { data: audiences, error: error } = await supabaseClient.rpc(
//     "get_audiences_by_campaign",
//     { selected_campaign_id: campaignId },
//   );

//   if (error) {
//     console.log("Error on function getWorkspaceAudiencesByCampaign", error);
//   }

//   return { audiences, error };
// }

// export async function getWorkspaceContactsByAudience({
//   supabaseClient,
// }: {
//   supabaseClient: SupabaseClient<Database>;
// }) {
//   const { data, error } = await supabaseClient.from("contact").select();

//   if (error) {
//     console.log("Error on function getWorkspaceAudiences");
//   }

//   return { data, error };
// }
