/**
 * CHS workspace_member accessors (Wave 1 Phase C).
 * Canonical membership is `workspace_member` + `role_id`; legacy `workspace_users`
 * remains for rollback evidence until Phase D.
 */
import { eq } from "drizzle-orm";
import { workspace_member } from "@/db/schema";
import {
  isProductRoleId,
  type ProductRoleId,
} from "@/lib/capabilities";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { logger } from "@/lib/logger.server";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

/** Stable member primary key — must match scripts/schema-transform/11-chs-membership-backfill.sql */
export function workspaceMemberId(workspaceId: string, userId: string): string {
  return `wm:${workspaceId}:${userId}`;
}

/**
 * Map invite / product role strings onto CHS `role_id`.
 * Policy: `field_director` → `admin` (wave1-membership-migration §3).
 */
export function memberRoleToRoleId(role: string): ProductRoleId {
  switch (role) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "member":
      return "member";
    case "caller":
      return "caller";
    case "field_director":
      return "admin";
    default: {
      if (isProductRoleId(role)) {
        return role;
      }
      throw new Error(`Unmapped workspace role for membership write: ${role}`);
    }
  }
}

/** Narrow known product role_id values; used for exhaustiveness on typed unions. */
export function assertProductRoleId(roleId: ProductRoleId): ProductRoleId {
  switch (roleId) {
    case "owner":
    case "admin":
    case "member":
    case "caller":
      return roleId;
    default: {
      const _exhaustive: never = roleId;
      return _exhaustive;
    }
  }
}

/** Product roles accepted by requireWorkspaceAccess (role_id values). */
export const WORKSPACE_MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "member",
  "caller",
] as const;

export type WorkspaceMembershipRole = (typeof WORKSPACE_MEMBERSHIP_ROLES)[number];

const WORKSPACE_ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  caller: 1,
};

function hasMinRole(
  role: string | undefined,
  minRole: string | undefined,
): boolean {
  if (!minRole) return true;
  if (!role) return false;
  return (WORKSPACE_ROLE_RANK[role] ?? 0) >= (WORKSPACE_ROLE_RANK[minRole] ?? 0);
}

function toDbError(error: unknown): { message: string; code?: string; details?: string } {
  if (error instanceof Error) {
    return { message: error.message, details: error.message };
  }
  return { message: String(error) };
}

/**
 * Compatibility row: callers still read `.role` (equals CHS `role_id`).
 */
export type UserRoleRow = { role: string };

export async function getUserRole({
  user,
  workspaceId,
  tdb: tdbIn,
}: {
  user: { id: string } | null;
  workspaceId: string;
  tdb?: TenantDb;
  null?: never;
}): Promise<UserRoleRow | null> {
  if (!user) {
    return null;
  }

  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const membership = await tdb.workspace_member.findFirst({
      where: eq(workspace_member.user_id, user.id),
      columns: { role_id: true },
    });
    if (!membership) {
      return null;
    }
    return { role: membership.role_id };
  } catch (error) {
    logger.error("Failed to load user role for workspace", {
      workspaceId,
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function addUserToWorkspace({
  workspaceId,
  userId,
  role,
  tdb: tdbIn,
}: {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "caller" | "member";
  tdb?: TenantDb;
  null?: never;
}) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  try {
    const roleId = memberRoleToRoleId(role);
    const rows = await tdb.workspace_member.insert({
      id: workspaceMemberId(workspaceId, userId),
      user_id: userId,
      role_id: roleId,
    });
    const data = rows[0] ?? null;
    if (!data) {
      return { data: null, error: toDbError(new Error("Insert returned no row")) };
    }
    return { data, error: null };
  } catch (error) {
    logger.error("Failed to join workspace", error);
    return { data: null, error: toDbError(error) };
  }
}

/**
 * Verify that the user is a member of the workspace. Non-members get a uniform
 * 404 (not 403) so a caller cannot infer whether a workspace id exists
 * (ADR-0004). Use as defense-in-depth when workspace_id comes from a request
 * body. Use `requireWorkspaceLoaderContext` / `withWorkspaceApi*` for
 * role-gated access.
 *
 * Pass `{ minRole: "admin" }` to require the user be an owner or admin.
 */
export async function requireWorkspaceAccess({
  user,
  workspaceId,
  tdb,
  minRole,
}: {
  user: { id: string };
  workspaceId: string;
  tdb?: TenantDb;
  minRole?: "owner" | "admin" | "member" | "caller" | string;
  null?: never;
}): Promise<void> {
  const role = await getUserRole({
    user,
    workspaceId,
    tdb,
  });
  if (!role) {
    throw new AppError("Workspace not found", 404, ErrorCode.NOT_FOUND);
  }
  if (
    !(WORKSPACE_MEMBERSHIP_ROLES as readonly string[]).includes(role.role)
  ) {
    throw new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN);
  }
  if (!hasMinRole(role.role, minRole)) {
    throw new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN);
  }
}
