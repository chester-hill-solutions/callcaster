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
  const { error } = await supabaseClient
    .from("workspace")
    .insert({ owner: userId, name, users: [userId] });

  return { error };
}
