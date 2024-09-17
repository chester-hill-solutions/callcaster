import { json, redirect } from "@remix-run/react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../database.types";
import { getWorkspaceUsers } from "../database.server";

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const username = formData.get("username").trim() as string;
  const newUserRole = formData.get("new_user_workspace_role") as string;
  if (!username) {
    return json({ user: null, error: "Must provide an email address" }, 400);
  }
  const {data:users} = await getWorkspaceUsers({supabaseClient,workspaceId});
  const match = users?.filter((user) => user.username === username);
  if (match?.length) {
    return json({user:null, error: "This user already exists"}, 403)
  }
 const { data: user, error: inviteUserError } =
    await supabaseClient.functions.invoke("invite-user-by-email", {
      body: {
        workspaceId,
        email: username,
        role: newUserRole,
      },
    });
  if (inviteUserError) {
    return json({ user: null, error: inviteUserError.message }, { headers });
  }
  return json({ data: user, error: null, success: true }, { headers });
}
export async function handleUpdateUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const userId = formData.get("user_id") as string;
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
  if (userId == null) {
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

export async function handleTransferWorkspace(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const currentOwnerUserId = formData.get("workspace_owner_id") as string;
  const newOwnerUserId = formData.get("user_id") as string;
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

export async function removeInvite({
  workspaceId,
  supabaseClient,
  formData,
  headers,
}: {
  workspaceId: string;
  supabaseClient: SupabaseClient<Database>;
  formData: FormData;
  headers: Headers;
}) {
  const userId = formData.get("userId");
  const { data, error } = await supabaseClient
    .from("workspace_invite")
    .delete()
    .eq("workspace", workspaceId)
    .eq("user_id", userId);
  if (error) {
    console.log("Error removing invite: ", error);
    return json({ data: null, error }, { headers });
  }
  return json({ data, error: null }, { headers });
}

export async function handleUpdateWebhook(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient,
  headers: Headers,
) {
  const { destinationUrl, insertEvent, updateEvent, userId, customHeaders } =
    Object.fromEntries(formData);
  const eventTypes = [];
  if (insertEvent) eventTypes.push("INSERT");
  if (updateEvent) eventTypes.push("UPDATE");
  const headersArray = JSON.parse(customHeaders);
  const custom_headers = {};
  headersArray.map((header) => (custom_headers[header[0]] = header[1]));
  const { data: webhook, error: webhookError } = await supabaseClient
    .from("webhook")
    .update({
      destination_url: destinationUrl,
      event: eventTypes,
      updated_at: new Date().toISOString(),
      updated_by: userId,
      custom_headers,
    })
    .eq("workspace", workspaceId)
    .select();
  if (webhookError) {
    console.error("Error updating webhook", webhookError);
    return json({ data: null, error: webhookError }, { headers });
  }
  return json({ data: webhook, error: null }, { headers });
}

export async function testWebhook(
  testData: any,
  destination_url: string,
  custom_headers: Headers,
) {
  try {
    const response = await fetch(destination_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...custom_headers,
      },
      body: JSON.stringify(testData),
    });

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error("Error sending test data", error);
    return { data: null, error: error.message };
  }
}
