import { SupabaseClient } from "@supabase/supabase-js";
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
    console.log(`Error on function getWorkspaceInfo: ${error.details}`);
  }

  return { data, error };
}

// type getTableDataByIdProps = {
//   supabaseClient: SupabaseClient<Database>;
//   tableName: string;
//   rowId?: string;
//   columnNames?: string[];
// };

// Too Generic
// export async function getTableDataById({
//   supabaseClient,
//   tableName,
//   rowId = "",
//   columnNames,
// }: getTableDataByIdProps) {
//   const joinedColumnNames = columnNames?.join(",");
//   const tableDataQuery = supabaseClient
//     .from(tableName)
//     .select(joinedColumnNames || "*");
//   // .eq("id", rowId);

//   const { data, error } = await tableDataQuery;
//   // console.log("getTableDataById: ", data);

//   if (error) {
//     console.log("Error on function getTableDataById: ", error);
//   }

//   return { data, error };
// }

export async function getWorkspaceAudiences({
  supabaseClient,
  workspaceId
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const { data, error } = await supabaseClient.from("audience").select().eq('workspace', workspaceId);

  if (error) {
    console.log("Error on function getWorkspaceAudiences");
  }

  return { data, error };
}

export async function getWorkspaceCampaigns({
  supabaseClient,
  workspaceId
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const { data, error } = await supabaseClient.from("campaign").select().eq('workspace', workspaceId);

  if (error) {
    console.log("Error on function getWorkspaceAudiences");
  }

  return { data, error };
}

export async function getWorkspaceContacts({
  supabaseClient,
  workspaceId
}: {
  supabaseClient: SupabaseClient<Database>;
}) {
  const { data, error } = await supabaseClient.from("contact").select().eq('workspace', workspaceId);

  if (error) {
    console.log("Error on function getWorkspaceAudiences");
  }

  return { data, error };
}