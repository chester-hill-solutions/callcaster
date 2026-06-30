import { desc, eq } from "drizzle-orm";
import {
  workspace as workspaceTable,
  workspace_users as workspaceUsersTable,
} from "@/db/schema";
import {
  getUserRole,
  getWorkspaceInfo,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  handleDeleteWorkspace,
  handleTransferWorkspace,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import type { Database } from "@/lib/db-types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import { adminDb } from "@/server/admin-db";

export async function listUserWorkspaces(
  userId: string,
) {
  try {
    const rows = await adminDb
      .select({
        last_accessed: workspaceUsersTable.last_accessed,
        role: workspaceUsersTable.role,
        workspace: {
          id: workspaceTable.id,
          name: workspaceTable.name,
          credits: workspaceTable.credits,
          created_at: workspaceTable.created_at,
        },
      })
      .from(workspaceUsersTable)
      .innerJoin(workspaceTable, eq(workspaceUsersTable.workspace_id, workspaceTable.id))
      .where(eq(workspaceUsersTable.user_id, userId))
      .orderBy(desc(workspaceUsersTable.last_accessed));

    return { ok: true as const, workspaces: rows };
  } catch (error) {
    logger.error("listUserWorkspaces error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to load workspaces",
      status: 500,
    };
  }
}

export async function getWorkspaceDetail(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const info = await getWorkspaceInfo({ workspaceId });
  if (info.error) {
    return { ok: false as const, error: String(info.error), status: 404 };
  }

  return { ok: true as const, workspace: info.data };
}

export async function updateWorkspaceName(
  userId: string,
  workspaceId: string,
  name: string,
) {
  const role = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role === MemberRole.Caller) {
    return { ok: false as const, error: "Not authorized", status: 403 };
  }

  const [data] = await adminDb
    .update(workspaceTable)
    .set({ name })
    .where(eq(workspaceTable.id, workspaceId))
    .returning({
      id: workspaceTable.id,
      name: workspaceTable.name,
      credits: workspaceTable.credits,
      created_at: workspaceTable.created_at,
    });

  if (!data) {
    return { ok: false as const, error: "Workspace not found", status: 404 };
  }

  return { ok: true as const, workspace: data };
}

export async function deleteWorkspaceApi(
  userId: string,
  workspaceId: string,
  headers: Headers,
) {
  const role = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role !== MemberRole.Owner) {
    return { ok: false as const, error: "Only workspace owners can delete", status: 403 };
  }

  const result = await handleDeleteWorkspace({
    workspaceId,
    headers,
  });

  if (result && typeof result === "object" && "error" in result && result.error) {
    return { ok: false as const, error: String(result.error), status: 400 };
  }

  return { ok: true as const };
}

export async function transferWorkspaceOwnershipApi(
  userId: string,
  workspaceId: string,
  newOwnerUserId: string,
  headers: Headers,
) {
  const role = await getUserRole({
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
    headers,
  );

  if (result && typeof result === "object" && "error" in result && result.error) {
    return { ok: false as const, error: String(result.error), status: 400 };
  }

  return { ok: true as const, new_owner_user_id: newOwnerUserId };
}
