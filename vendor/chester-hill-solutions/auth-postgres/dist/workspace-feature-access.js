import { sql } from "drizzle-orm";
import { getWorkspaceMemberRoleId } from "./workspace-access.js";
const DEFAULT_CACHE_TTL_MS = 60_000;
const permissionCache = new Map();
export class WorkspaceFeatureAccessError extends Error {
    constructor(message = "Insufficient workspace permissions") {
        super(message);
        this.name = "WorkspaceFeatureAccessError";
    }
}
export function clearWorkspaceFeaturePermissionCache() {
    permissionCache.clear();
}
function cacheKey(workspaceId, roleId, featureId) {
    return `${workspaceId}:${roleId}:${featureId}`;
}
function readRpcBoolean(result) {
    if (!result || typeof result !== "object")
        return false;
    const rows = result.rows ?? result;
    if (!Array.isArray(rows) || rows.length === 0)
        return false;
    const row = rows[0];
    if (!row || typeof row !== "object")
        return false;
    const record = row;
    const value = record.check_workspace_feature_permission ??
        record.checkWorkspaceFeaturePermission ??
        Object.values(record)[0];
    return value === true || value === "t" || value === 1;
}
export async function checkWorkspaceFeaturePermission(db, params) {
    const result = await db.execute(sql `SELECT check_workspace_feature_permission(${params.workspaceId}, ${params.roleId}, ${params.featureId}) AS check_workspace_feature_permission`);
    return readRpcBoolean(result);
}
export async function canAccessWorkspaceFeature(db, params, options) {
    const roleId = await getWorkspaceMemberRoleId(db, params);
    if (!roleId)
        return false;
    const ttl = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const key = cacheKey(params.workspaceId, roleId, params.featureId);
    if (!options?.bypassCache) {
        const cached = permissionCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.allowed;
        }
    }
    let allowed = false;
    try {
        allowed = await checkWorkspaceFeaturePermission(db, {
            workspaceId: params.workspaceId,
            roleId,
            featureId: params.featureId,
        });
    }
    catch {
        return false;
    }
    permissionCache.set(key, { allowed, expiresAt: Date.now() + ttl });
    return allowed;
}
export function createRequireWorkspaceFeature(featureId) {
    return async (db, params) => {
        const allowed = await canAccessWorkspaceFeature(db, { ...params, featureId });
        if (!allowed) {
            throw new WorkspaceFeatureAccessError();
        }
    };
}
export { getWorkspaceMemberRoleId };
