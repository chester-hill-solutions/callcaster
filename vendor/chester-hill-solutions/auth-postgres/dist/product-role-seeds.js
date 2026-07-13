import { asCapabilityId } from "@chester-hill-solutions/auth";
import { workspaceFeaturePermissions, workspaceFeatures, workspaceRoles, } from "./workspace-authz-schema.js";
/** Cutover roles for CallCaster-style products. Owner is never invitational. */
export const PRODUCT_ROLE_IDS = ["owner", "admin", "member", "caller"];
export const PRODUCT_ROLE_RANKS = {
    caller: 0,
    member: 1,
    admin: 2,
    owner: 3,
};
/** Roles an actor with `fromRole` may invite (strictly subordinate). Owner is never invitational. */
export function invitationalRolesFor(fromRole) {
    switch (fromRole) {
        case "owner":
            return ["admin", "member", "caller"];
        case "admin":
            return ["member", "caller"];
        case "member":
            return ["caller"];
        case "caller":
            return [];
        default: {
            const _exhaustive = fromRole;
            return _exhaustive;
        }
    }
}
/**
 * Upsert global (workspace_id null) roles + features + allow permissions for a
 * product capability matrix. Idempotent on stable ids.
 */
export async function seedProductRoleCapabilityMatrix(db, matrix) {
    const now = new Date();
    const allCapabilities = [
        ...new Set(matrix.flatMap((row) => row.capabilityIds.map((id) => String(id)))),
    ];
    for (const roleId of PRODUCT_ROLE_IDS) {
        await db
            .insert(workspaceRoles)
            .values({
            id: roleId,
            name: roleId,
            workspaceId: null,
            rank: PRODUCT_ROLE_RANKS[roleId],
            createdAt: now,
        })
            .onConflictDoNothing();
    }
    for (const capabilityId of allCapabilities) {
        await db
            .insert(workspaceFeatures)
            .values({
            id: capabilityId,
            name: capabilityId,
            description: null,
            workspaceId: null,
            createdAt: now,
        })
            .onConflictDoNothing();
    }
    for (const row of matrix) {
        for (const capabilityId of row.capabilityIds) {
            await db
                .insert(workspaceFeaturePermissions)
                .values({
                id: `${row.roleId}:${capabilityId}`,
                workspaceId: null,
                roleId: row.roleId,
                featureId: capabilityId,
                allowed: true,
                createdAt: now,
            })
                .onConflictDoNothing();
        }
    }
}
export function capabilitySetFromIds(ids) {
    return new Set(ids.map((id) => asCapabilityId(id)));
}
