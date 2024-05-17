import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function getUserWorkspaces({
  supabaseClient,
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const workspacesQuery = supabaseClient
    .from("workspace")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error } = await workspacesQuery;
  //   console.log(data);

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
