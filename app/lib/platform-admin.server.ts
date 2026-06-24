import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveWorkspaceAdminRows } from "@/lib/admin-workspaces.server";
import type { Database } from "@/lib/database.types";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database.server";

type Supabase = SupabaseClient<Database>;
type UserRow = Database["public"]["Tables"]["user"]["Row"];

export async function getAdminDashboard(supabaseClient: Supabase) {
  const [
    { data: workspaces },
    { data: users },
    { data: workspaceUsers },
    { data: workspaceNumbers },
    { data: allCampaigns },
  ] = await Promise.all([
    supabaseClient.from("workspace").select("*, campaign(*)"),
    supabaseClient
      .from("user")
      .select("*")
      .order("created_at", { ascending: false }),
    supabaseClient.from("workspace_users").select("*"),
    supabaseClient.from("workspace_number").select("*"),
    supabaseClient
      .from("campaign")
      .select("*, workspace(*)")
      .order("created_at", { ascending: false }),
  ]);

  const workspaceRows = deriveWorkspaceAdminRows({
    workspaces: workspaces ?? [],
    users: users ?? [],
    workspaceUsers: workspaceUsers ?? [],
    workspaceNumbers: workspaceNumbers ?? [],
  });

  return {
    workspaces: workspaces ?? [],
    users: users ?? [],
    workspaceUsers: workspaceUsers ?? [],
    workspaceNumbers: workspaceNumbers ?? [],
    workspaceRows,
    campaigns: allCampaigns ?? [],
    stats: {
      totalWorkspaces: workspaces?.length ?? 0,
      totalUsers: users?.length ?? 0,
      totalCampaigns:
        workspaces?.reduce(
          (acc, workspace) => acc + (workspace.campaign?.length ?? 0),
          0,
        ) ?? 0,
      activeWorkspaces: workspaces?.filter((w) => !w.disabled).length ?? 0,
    },
  };
}

export async function toggleWorkspaceStatus(
  supabaseClient: Supabase,
  workspaceId: string,
  disabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("workspace")
    .update({ disabled })
    .eq("id", workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function syncAllWorkspacesTwilio(
  supabaseClient: Supabase,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient.functions.invoke(
    "workspace-twilio-sync",
    { body: {} },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function syncWorkspaceTwilio(
  supabaseClient: Supabase,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await syncWorkspaceTwilioSnapshot({ supabaseClient, workspaceId });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to sync workspace Twilio data",
    };
  }
}

export async function disableUser(
  supabaseClient: Supabase,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("user")
    .update({ access_level: "disabled" })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getAdminUser(
  supabaseClient: Supabase,
  userId: string,
): Promise<
  | { ok: true; user: UserRow }
  | { ok: false; error: string; status: number }
> {
  const { data: targetUser, error } = await supabaseClient
    .from("user")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !targetUser) {
    return { ok: false, error: "User not found", status: 404 };
  }

  return { ok: true, user: targetUser };
}

export async function updateAdminUser(
  supabaseClient: Supabase,
  userId: string,
  updates: {
    first_name?: string | null;
    last_name?: string | null;
    username: string;
    access_level?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("user")
    .update({
      first_name: updates.first_name ?? null,
      last_name: updates.last_name ?? null,
      username: updates.username,
      access_level: updates.access_level ?? "standard",
    })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getAdminUserWorkspaces(
  supabaseClient: Supabase,
  userId: string,
) {
  const userResult = await getAdminUser(supabaseClient, userId);
  if (!userResult.ok) {
    return userResult;
  }

  const [
    { data: allWorkspaces },
    { data: userWorkspaces },
    { data: pendingInvites },
  ] = await Promise.all([
    supabaseClient.from("workspace").select("*").order("name"),
    supabaseClient
      .from("workspace_users")
      .select("*, workspace(*)")
      .eq("user_id", userId),
    supabaseClient
      .from("workspace_invite")
      .select("*, workspace(*)")
      .eq("email", userResult.user.username)
      .eq("status", "pending"),
  ]);

  return {
    ok: true as const,
    targetUser: userResult.user,
    allWorkspaces: allWorkspaces ?? [],
    userWorkspaces: userWorkspaces ?? [],
    pendingInvites: pendingInvites ?? [],
  };
}

export async function addUserToWorkspaceAdmin(
  supabaseClient: Supabase,
  userId: string,
  workspaceId: string,
  role: "owner" | "member" | "caller" | "admin",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existingMembership } = await supabaseClient
    .from("workspace_users")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (existingMembership) {
    return { ok: false, error: "User is already a member of this workspace" };
  }

  const { error } = await supabaseClient.from("workspace_users").insert({
    user_id: userId,
    workspace_id: workspaceId,
    role,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateUserWorkspaceRoleAdmin(
  supabaseClient: Supabase,
  userId: string,
  workspaceId: string,
  role: "owner" | "member" | "caller" | "admin",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("workspace_users")
    .update({ role })
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeUserFromWorkspaceAdmin(
  supabaseClient: Supabase,
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("workspace_users")
    .delete()
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function cancelWorkspaceInviteAdmin(
  supabaseClient: Supabase,
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseClient
    .from("workspace_invite")
    .delete()
    .eq("id", inviteId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
