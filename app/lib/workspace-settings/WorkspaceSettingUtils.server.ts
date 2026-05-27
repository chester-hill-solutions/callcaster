import { data as routeData, redirect } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../database.types";
import { getWorkspaceUsers } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";

export async function handleAddUser(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const username = formData.get("username") as string;
  const newUserRole = formData.get("new_user_workspace_role") as string;
  if (!username) {
    return routeData({ user: null, error: "Must provide an email address" }, 400);
  }
  const cleanedName = username.toLowerCase().trim();
  const { data: users } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const match = users?.filter((user) => {
    return user.username === cleanedName;
  });
  if (match?.length) {
    return routeData({ user: null, error: "This user is already an agent in the workspace." }, 403);
  }
  const { data: user, error: inviteUserError } =
    await supabaseClient.functions.invoke("invite-user-by-email", {
      body: {
        workspaceId,
        email: cleanedName,
        role: newUserRole,
      },
    });
  if (inviteUserError) {
    return routeData({ user: null, error: inviteUserError.message }, { headers });
  }
  return routeData({ data: user, error: null, success: true }, { headers });
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
    .update({ role: updatedWorkspaceRole as "owner" | "member" | "caller" | "admin" | undefined })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();

  return routeData(
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

  return routeData(
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
    return routeData({ error: `User ${userId} not found` }, { headers });
  }

  const { data: deletedSelf, error: errorDeletingSelf } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select()
    .single();
  if (errorDeletingSelf) {
    logger.error("Error deleting current user from workspace", errorDeletingSelf);
    return { data: null, error: errorDeletingSelf.message };
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
    return routeData({ error: errorUpdatingNewOwner.message }, { headers });
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
    return routeData({ error: errorUpdatingCurrentOwner.message }, { headers });
  }

  return routeData(
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
    logger.error("Error deleting workspace: ", deleteWorkspaceError);
    return { data: null, error: deleteWorkspaceError };
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
    .eq("user_id", userId as string);
  if (error) {
    logger.error("Error removing invite: ", error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function handleUpdateWebhook(
  formData: FormData,
  workspaceId: string,
  supabaseClient: SupabaseClient<Database>,
  headers: Headers,
) {
  const webhookId = formData.get("webhookId") as string;
  const destinationUrl = formData.get("destinationUrl") as string;
  const userId = formData.get("userId") as string;
  const customHeaders = formData.get("customHeaders") as string;
  const events = formData.get("events") as string;
  
  // Parse the events array from JSON
  const parsedEvents = JSON.parse(events);
  
  const headersArray = JSON.parse(customHeaders);
  const custom_headers: Record<string, string> = {};
  headersArray.map((header: [string, string]) => (custom_headers[header[0]] = header[1]));
  const updateData = {
    id: parseInt(webhookId),
    destination_url: destinationUrl,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    custom_headers,
    events: parsedEvents,
    workspace: workspaceId,
  };
  const { data: webhook, error: webhookError } = await supabaseClient
    .from("webhook")
    .upsert(updateData)
    .select();
  if (webhookError) {
    logger.error("Error updating webhook", webhookError);
    return routeData({ data: null, error: webhookError.message }, { headers });
  }
  
  return routeData({ data: webhook, error: null }, { headers });
}

export async function testWebhook(
  testData: string | Record<string, unknown>,
  destination_url: string,
  custom_headers: string | Record<string, string>,
) {
  try {
    // Handle possible string inputs (from form submissions)
    const parsedTestData = typeof testData === 'string' ? JSON.parse(testData) : testData;
    const parsedHeaders = typeof custom_headers === 'string' ? JSON.parse(custom_headers) : custom_headers;
    
    // Convert headers array to object if needed
    const headersObject: Record<string, string> = {};
    if (Array.isArray(parsedHeaders)) {
      parsedHeaders.forEach(([key, value]: [string, string]) => {
        if (key) headersObject[key] = value;
      });
    } else {
      Object.assign(headersObject, parsedHeaders);
    }

    const response = await fetch(destination_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersObject,
      },
      body: JSON.stringify(parsedTestData),
    });

    // Try to parse response as JSON, fallback to text if not possible
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { 
      data, 
      status: response.status,
      statusText: response.statusText,
      error: null 
    };
  } catch (error: unknown) {
    logger.error("Error sending test data", error);
    return { 
      data: null, 
      status: 500,
      statusText: "Error sending webhook",
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

export { sendWorkspaceWebhookNotification as sendWebhookNotification } from "@/lib/workspace-webhooks.server";
