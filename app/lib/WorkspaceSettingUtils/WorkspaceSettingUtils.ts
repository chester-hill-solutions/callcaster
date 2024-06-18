import { json, redirect } from "@remix-run/react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../database.types";

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const username = formData.get("username") as string;
  // if (!userId) {
  //   // console.log("HERE no username");
  //   return json({ error: "No username provided" }, { headers });
  // }

  const newUserRole = formData.get("new_user_workspace_role") as string;

  const { data: user, error: getUserError } = await supabaseClient
    .from("user")
    .select()
    .eq("username", username)
    .single();

  if (user == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${username} not found` }, { headers });
  }
  console.log("Selected user: ", user);

  const { data: newUser, error: errorAddingUser } = await supabaseClient
    .from("workspace_users")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: newUserRole,
    })
    .select()
    .single();

  if (newUser == null) {
    if (errorAddingUser != null && errorAddingUser.code === "23505") {
      return json(
        { error: `User ${username} is already in this workspace!` },
        { headers },
      );
    }
    // console.log("Insert error on workspace_users: ", errorAddingUser);
    return json(
      { error: `Could not add ${username} to workspace!` },
      { headers },
    );
  }

  return json({ data: newUser, error: errorAddingUser?.message }, { headers });
}

export async function handleUpdateUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  //   console.log("\nHERE");
  const userId = formData.get("user_id") as string;

  // const { data: user, error: getUserError } = await supabaseClient
  //   .from("user")
  //   .select()
  //   .eq("username", userName)
  //   .single();

  // if (user == null) {
  //   // console.log(`User ${userName} not found - `, getUserError);
  //   return json({ error: `User ${userName} not found` }, { headers });
  // }
  //   console.log("Selected user: ", user);

  const updatedWorkspaceRole = formData.get("updated_workspace_role") as string;
  const { data: updatedUser, error: errorUpdatingUser } = await supabaseClient
    .from("workspace_users")
    .update({ role: updatedWorkspaceRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();

  return json(
    { data: updatedUser, error: errorUpdatingUser?.message },
    { headers },
  );
}

export async function handleDeleteUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const userId = formData.get("user_id") as string;

  // const { data: user, error: getUserError } = await supabaseClient
  //   .from("user")
  //   .select()
  //   .eq("username", userName)
  //   .single();

  // if (user == null) {
  //   // console.log(`User ${userName} not found - `, getUserError);
  //   return json({ error: `User ${userName} not found` }, { headers });
  // }
  // console.log("Selected user: ", user);

  const { data: deletedUser, error: errorDeletingUser } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();

  return json(
    { data: deletedUser, error: errorDeletingUser?.message },
    { headers },
  );
}

export async function handleDeleteSelf(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const userId = formData.get("user_id") as string;

  // const { data: user, error: getUserError } = await supabaseClient
  //   .from("user")
  //   .select()
  //   .eq("username", userName)
  //   .single();

  if (userId == null) {
    // console.log(`User ${userName} not found - `, getUserError);
    return json({ error: `User ${userId} not found` }, { headers });
  }

  const { data: deletedSelf, error: errorDeletingSelf } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();

  if (errorDeletingSelf) {
    console.log(errorDeletingSelf);
    return json({ data: null, error: errorDeletingSelf.message });
  }

  return redirect("/workspaces", { headers });
}

export async function handleInviteCaller(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const callerEmail = formData.get("callerEmail") as string;

  const session = await supabaseClient.auth.getSession();
  if (session == null) {
    return json({ error: "No user session" }, { headers });
  }

  const { data: callerSignUpData, error: callerSignUpError } =
    await supabaseClient.auth.admin.generateLink({
      type: "signup",
      email: callerEmail,
      password: "password1234",
      options: {
        data: {
          user_workspace_role: "caller",
          add_to_workspace: workspaceId,
          first_name: "New",
          last_name: "Caller",
        },
        redirectTo: "http://localhost:3000/signin",
      },
    });

  console.log(callerSignUpData);
  // if (callerSignUpData?.user != null) {
  //   const { data: addCallerToWorkspaceData, error: addCallerToWorkspaceError } =
  //     await supabaseClient
  //       .from("workspace_users")
  //       .insert({
  //         workspace_id: workspaceId,
  //         user_id: callerSignUpData.user.id,
  //         role: "caller",
  //       })
  //       .select()
  //       .single();

  //   if (addCallerToWorkspaceData != null) {
  //     return json({ data: addCallerToWorkspaceData }, { headers });
  //   } else if (addCallerToWorkspaceError) {
  //     return json({ error: addCallerToWorkspaceError }, { headers });
  //   }
  // }

  return json(
    { data: callerSignUpData, error: callerSignUpError?.message },
    { headers },
  );
}

export async function handleTransferWorkspace(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const currentOwnerUserId = formData.get("workspace_owner_id") as string;
  const newOwnerUserId = formData.get("user_id") as string;

  // const { data: currentOwnerData, error: errorGettingCurrentOwner } =
  //   await supabaseClient
  //     .from("user")
  //     .select()
  //     .eq("username", currentOwnerUserName)
  //     .single();

  // const { data: newOwnerData, error: errorGettingNewOwner } =
  //   await supabaseClient
  //     .from("user")
  //     .select()
  //     .eq("username", newOwnerUserName)
  //     .single();

  // if (currentOwnerData == null) {
  //   console.log("ERROR GETTING CURRENT OWNER");
  //   return json({ error: errorGettingCurrentOwner.message }, { headers });
  // } else if (newOwnerData == null) {
  //   console.log("ERROR GETTING NEW OWNER");
  //   return json({ error: errorGettingNewOwner.message }, { headers });
  // }

  const { data: updatedNewOwner, error: errorUpdatingNewOwner } =
    await supabaseClient
      .from("workspace_users")
      .update({ role: "owner" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", newOwnerUserId)
      .select()
      .single();

  if (errorUpdatingNewOwner) {
    return json({ error: errorUpdatingNewOwner.message }, { headers });
  }

  const { data: updatedCurrentOwner, error: errorUpdatingCurrentOwner } =
    await supabaseClient
      .from("workspace_users")
      .update({ role: "admin" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", currentOwnerUserId)
      .select()
      .single();

  if (errorUpdatingCurrentOwner) {
    return json({ error: errorUpdatingCurrentOwner.message }, { headers });
  }

  return json(
    { data: updatedCurrentOwner, error: errorUpdatingCurrentOwner },
    { headers },
  );
}

export async function handleDeleteWorkspace({
  workspaceId,
  supabaseClient,
  headers,
}: {
  workspaceId: string;
  supabaseClient: SupabaseClient<Database>;
  headers: Headers;
}) {
  // const response = await supabaseClient
  //   .from("workspace")
  //   .delete()
  //   .eq("id", workspaceId);

  // console.log("Delete Workspace: ", response);

  const { data: deleteWorkspaceData, error: deleteWorkspaceError } =
    await supabaseClient
      .from("workspace")
      .delete()
      .eq("id", workspaceId)
      .select();

  if (deleteWorkspaceError) {
    console.log("Error deleting workspace: ", deleteWorkspaceError);
    return json({ data: null, error: deleteWorkspaceError }, { headers });
  }

  return redirect("/workspaces");
}
