export function asCapabilityId(id) {
    return id;
}
export function actorHasCapability(actor, capabilityId) {
    return actor.capabilities.has(asCapabilityId(capabilityId));
}
export function requireActorCapability(actor, capabilityId) {
    if (!actorHasCapability(actor, capabilityId)) {
        throw new CapabilityDeniedError(String(capabilityId), actor);
    }
}
export class CapabilityDeniedError extends Error {
    capabilityId;
    actorType;
    workspaceId;
    constructor(capabilityId, actor) {
        super(`Missing capability: ${capabilityId}`);
        this.name = "CapabilityDeniedError";
        this.capabilityId = capabilityId;
        this.actorType = actor.type;
        this.workspaceId = actor.workspaceId;
    }
}
