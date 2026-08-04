import type { DB } from "./schema.js";
export type WorkspaceRole = string;
export declare const ROLE_HIERARCHY: Record<string, number>;
export declare function hasMinRole(userRole: string, requiredRole: string): boolean;
export declare function getWorkspaceMemberRoleId(db: DB, params: {
    workspaceId: string;
    userId: string;
}): Promise<string | null>;
/** @deprecated Use getWorkspaceMemberRoleId — returns role_id (same as role id for system roles). */
export declare function getWorkspaceMemberRole(db: DB, params: {
    workspaceId: string;
    userId: string;
}): Promise<WorkspaceRole | null>;
export declare function createRequireWorkspaceRole(requiredRole: WorkspaceRole): (db: DB, params: {
    workspaceId: string;
    userId: string;
}) => Promise<void>;
export declare function getWorkspacesForUser(db: DB, userId: string): Promise<{
    id: string;
    name: string;
    slug: string;
    roleId: string;
    role: string | null;
}[]>;
