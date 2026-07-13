/** Branded capability ID string. Products define their own allowlisted IDs. */
export type CapabilityId = string & {
    readonly __brand: "CapabilityId";
};
export declare function asCapabilityId(id: string): CapabilityId;
/** Session member acting with capabilities resolved from workspace role permissions. */
export type SessionAuthorizationActor = {
    type: "session";
    userId: string;
    workspaceId: string;
    /** Effective capability allowlist for this request (resolved or cached). */
    capabilities: ReadonlySet<CapabilityId>;
};
/**
 * API-key actor. Products own key storage; adapters present an allowlist of the
 * same capability IDs used by session actors.
 */
export type ApiKeyAuthorizationActor = {
    type: "api_key";
    keyId: string;
    workspaceId: string;
    capabilities: ReadonlySet<CapabilityId>;
};
export type AuthorizationActor = SessionAuthorizationActor | ApiKeyAuthorizationActor;
export declare function actorHasCapability(actor: AuthorizationActor, capabilityId: CapabilityId | string): boolean;
export declare function requireActorCapability(actor: AuthorizationActor, capabilityId: CapabilityId | string): void;
export declare class CapabilityDeniedError extends Error {
    readonly capabilityId: string;
    readonly actorType: AuthorizationActor["type"];
    readonly workspaceId: string;
    constructor(capabilityId: string, actor: AuthorizationActor);
}
