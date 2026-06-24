import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getUserRole,
  getWorkspaceInfo,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  handleDeleteWorkspace,
  handleTransferWorkspace,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import type { Database } from "@/lib/database.types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";

export async function listUserWorkspaces(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name, credits, created_at)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (error) {
    logger.error("listUserWorkspaces error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, workspaces: data ?? [] };
}

export async function getWorkspaceDetail(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const info = await getWorkspaceInfo({ supabaseClient, workspaceId });
  if (info.error) {
    return { ok: false as const, error: String(info.error), status: 404 };
  }

  return { ok: true as const, workspace: info.data };
}

export async function updateWorkspaceName(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  name: string,
) {
  const role = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role === MemberRole.Caller) {
    return { ok: false as const, error: "Not authorized", status: 403 };
  }

  const { data, error } = await supabaseClient
    .from("workspace")
    .update({ name })
    .eq("id", workspaceId)
    .select("id, name, credits, created_at")
    .single();

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, workspace: data };
}

export async function deleteWorkspaceApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  headers: Headers,
) {
  const role = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role !== MemberRole.Owner) {
    return { ok: false as const, error: "Only workspace owners can delete", status: 403 };
  }

  const result = await handleDeleteWorkspace({
    workspaceId,
    supabaseClient,
    headers,
  });

  if (result && typeof result === "object" && "error" in result && result.error) {
    return { ok: false as const, error: String(result.error), status: 400 };
  }

  return { ok: true as const };
}

export async function transferWorkspaceOwnershipApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  newOwnerUserId: string,
  headers: Headers,
) {
  const role = await getUserRole({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role !== MemberRole.Owner) {
    return { ok: false as const, error: "Only workspace owners can transfer", status: 403 };
  }

  const formData = new FormData();
  formData.set("workspace_owner_id", userId);
  formData.set("user_id", newOwnerUserId);

  const result = await handleTransferWorkspace(
    formData,
    workspaceId,
    supabaseClient,
    headers,
  );

  if (result && typeof result === "object" && "error" in result && result.error) {
    return { ok: false as const, error: String(result.error), status: 400 };
  }

  return { ok: true as const, new_owner_user_id: newOwnerUserId };
}
