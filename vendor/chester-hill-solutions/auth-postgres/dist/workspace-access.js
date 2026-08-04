import { and, eq } from "drizzle-orm";
import { workspaceMembers, workspaceRoles, workspaces } from "./schema.js";
export const ROLE_HIERARCHY = {
    sender: 0,
    editor: 1,
    admin: 2,
};
export function hasMinRole(userRole, requiredRole) {
    const userRank = ROLE_HIERARCHY[userRole] ?? -1;
    const requiredRank = ROLE_HIERARCHY[requiredRole] ?? Number.MAX_SAFE_INTEGER;
    return userRank >= requiredRank;
}
export async function getWorkspaceMemberRoleId(db, params) {
    const [row] = await db
        .select({ roleId: workspaceMembers.roleId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, params.workspaceId), eq(workspaceMembers.userId, params.userId)))
        .limit(1);
    return row?.roleId ?? null;
}
/** @deprecated Use getWorkspaceMemberRoleId — returns role_id (same as role id for system roles). */
export async function getWorkspaceMemberRole(db, params) {
    return getWorkspaceMemberRoleId(db, params);
}
export function createRequireWorkspaceRole(requiredRole) {
    return async (db, params) => {
        const roleId = await getWorkspaceMemberRoleId(db, params);
        if (!roleId) {
            throw new Error("Not a member of this workspace");
        }
        if (!hasMinRole(roleId, requiredRole)) {
            throw new Error(`Requires ${requiredRole} role or higher`);
        }
    };
}
export async function getWorkspacesForUser(db, userId) {
    return db
        .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        roleId: workspaceMembers.roleId,
        role: workspaceRoles.name,
    })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .leftJoin(workspaceRoles, eq(workspaceMembers.roleId, workspaceRoles.id))
        .where(eq(workspaceMembers.userId, userId));
}
