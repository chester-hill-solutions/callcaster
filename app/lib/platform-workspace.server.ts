import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import {
  getUserRole,
  getWorkspaceInfo,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import {
  handleDeleteWorkspace,
  handleTransferWorkspace,
} from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import type { Database } from "@/lib/db-types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import { adminDb } from "@/server/admin-db";
import { hasMinRole } from "@/lib/workspace-route.server";
import { safeRecordWorkspaceAuditEvent } from "@/lib/audit-event.server";
import { timestampToIsoString } from "@/lib/parse-utils.server";
import { isTwoFactorEnabled } from "@/lib/two-factor.server";
import { listUserWorkspaceMembershipsForProfile } from "@/lib/workspace-members-db.server";

export async function listUserWorkspaces(
  userId: string,
) {
  try {
    const rows = await listUserWorkspaceMembershipsForProfile(userId);

    return {
      ok: true as const,
      workspaces: rows.map((row) => ({
        ...row,
        last_accessed: timestampToIsoString(row.last_accessed),
      })),
    };
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

export async function getWorkspaceDetailForDataPlane(
  userId: string | null,
  workspaceId: string,
) {
  if (userId) {
    return getWorkspaceDetail(userId, workspaceId);
  }

  const info = await getWorkspaceInfo({ workspaceId });
  if (info.error) {
    return { ok: false as const, error: String(info.error), status: 404 };
  }
  if (!info.data) {
    return { ok: false as const, error: "Workspace not found", status: 404 };
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

  if (!role || !hasMinRole(role.role, MemberRole.Admin)) {
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

  await safeRecordWorkspaceAuditEvent({
    workspaceId,
    actorType: "session",
    actorId: userId,
    action: "workspace.update",
    targetType: "workspace",
    targetId: workspaceId,
    outcome: "success",
    metadata: { name },
  });

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

  await safeRecordWorkspaceAuditEvent({
    workspaceId,
    actorType: "session",
    actorId: userId,
    action: "workspace.delete",
    targetType: "workspace",
    targetId: workspaceId,
    outcome: "success",
  });

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

  const newOwnerEnrolled = await isTwoFactorEnabled(newOwnerUserId);
  if (!newOwnerEnrolled) {
    return {
      ok: false as const,
      error:
        "The new owner must enroll in two-factor authentication before ownership can be transferred.",
      status: 403,
    };
  }

  const formData = new FormData();
  formData.set("workspace_owner_id", userId);
  formData.set("user_id", newOwnerUserId);

  const result = await handleTransferWorkspace(
    formData,
    workspaceId,
    headers,
    userId,
  );

  if (result && typeof result === "object" && "error" in result && result.error) {
    return { ok: false as const, error: String(result.error), status: 400 };
  }

  await safeRecordWorkspaceAuditEvent({
    workspaceId,
    actorType: "session",
    actorId: userId,
    action: "workspace.transfer_ownership",
    targetType: "workspace",
    targetId: workspaceId,
    outcome: "success",
    metadata: { new_owner_user_id: newOwnerUserId },
  });

  return { ok: true as const, new_owner_user_id: newOwnerUserId };
}
