import type { DB } from "./schema.js";
import { getWorkspaceMemberRoleId } from "./workspace-access.js";
export declare class WorkspaceFeatureAccessError extends Error {
    constructor(message?: string);
}
export declare function clearWorkspaceFeaturePermissionCache(): void;
export declare function checkWorkspaceFeaturePermission(db: DB, params: {
    workspaceId: string;
    roleId: string;
    featureId: string;
}): Promise<boolean>;
export declare function canAccessWorkspaceFeature(db: DB, params: {
    workspaceId: string;
    userId: string;
    featureId: string;
}, options?: {
    cacheTtlMs?: number;
    bypassCache?: boolean;
}): Promise<boolean>;
export declare function createRequireWorkspaceFeature(featureId: string): (db: DB, params: {
    workspaceId: string;
    userId: string;
}) => Promise<void>;
export { getWorkspaceMemberRoleId };
