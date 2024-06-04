import { json } from "@remix-run/react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../database.types";

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const userName = formData.get("username") as string;
  if (!userName) {
    // console.log("HERE no username");
    return json({ error: "No username provided" }, { headers });
  }

  const { data: user, error: getUserError } = await supabaseClient
    .from("user")
    .select()
    .eq("username", userName)
    .single();

  if (user == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${userName} not found` }, { headers });
  }
  // console.log("Selected user: ", user);

  const { data: newUser, error: errorAddingUser } = await supabaseClient
    .from("workspace_users")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "member",
    })
    .select()
    .single();

  if (newUser == null) {
    if (errorAddingUser != null && errorAddingUser.code === "23505") {
      return json(
        { error: `User ${userName} is already in this workspace!` },
        { headers },
      );
    }
    // console.log("Insert error on workspace_users: ", errorAddingUser);
    return json(
      { error: `Could not add ${userName} to workspace!` },
      { headers },
    );
  }

  return json({ newUser, error: errorAddingUser }, { headers });
}

export async function handleUpdateUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  //   console.log("\nHERE");
  const userName = formData.get("username");

  const { data: user, error: getUserError } = await supabaseClient
    .from("user")
    .select()
    .eq("username", userName)
    .single();

  if (user == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${userName} not found` }, { headers });
  }
  //   console.log("Selected user: ", user);

  const updatedWorkspaceRole = formData.get("updated_workspace_role") as string;
  const { data: updatedUser, error: errorUpdatingUser } = await supabaseClient
    .from("workspace_users")
    .update({ role: updatedWorkspaceRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .select()
    .single();

  return { data: updatedUser, error: errorUpdatingUser };
}

export async function handleDeleteUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  console.log("\nHERE");
  const userName = formData.get("username");

  const { data: user, error: getUserError } = await supabaseClient
    .from("user")
    .select()
    .eq("username", userName)
    .single();

  if (user == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${userName} not found` }, { headers });
  }
  console.log("Selected user: ", user);

  const { data: deletedUser, error: errorDeletingUser } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .select()
    .single();

  return { data: deletedUser, error: errorDeletingUser };
}
