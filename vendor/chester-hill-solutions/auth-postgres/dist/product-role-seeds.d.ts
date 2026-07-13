import type { CapabilityId } from "@chester-hill-solutions/auth";
import type { DB } from "./schema.js";
/** Cutover roles for CallCaster-style products. Owner is never invitational. */
export declare const PRODUCT_ROLE_IDS: readonly ["owner", "admin", "member", "caller"];
export type ProductRoleId = (typeof PRODUCT_ROLE_IDS)[number];
export declare const PRODUCT_ROLE_RANKS: Record<ProductRoleId, number>;
/** Roles an actor with `fromRole` may invite (strictly subordinate). Owner is never invitational. */
export declare function invitationalRolesFor(fromRole: ProductRoleId): ProductRoleId[];
export type RoleCapabilitySeed = {
    roleId: ProductRoleId;
    capabilityIds: readonly string[];
};
/**
 * Upsert global (workspace_id null) roles + features + allow permissions for a
 * product capability matrix. Idempotent on stable ids.
 */
export declare function seedProductRoleCapabilityMatrix(db: DB, matrix: readonly RoleCapabilitySeed[]): Promise<void>;
export declare function capabilitySetFromIds(ids: readonly string[]): ReadonlySet<CapabilityId>;
