import {
  asCapabilityId,
  type ApiKeyAuthorizationActor,
  type AuthorizationActor,
  type CapabilityId,
  type SessionAuthorizationActor,
} from "@chester-hill-solutions/auth";
import { capabilitySetFromIds } from "@chester-hill-solutions/auth-postgres";
import {
  capabilityIdsForRole,
  isProductCapabilityId,
  type ProductCapabilityId,
} from "@/lib/capabilities";

export function capabilitySetForRole(role: string): ReadonlySet<CapabilityId> {
  return capabilitySetFromIds(capabilityIdsForRole(role));
}

export function capabilitySetFromScopeAllowlist(
  scopes: readonly string[],
): ReadonlySet<CapabilityId> {
  const valid = scopes.filter(isProductCapabilityId);
  return capabilitySetFromIds(valid);
}

export function sessionActorFromMembership(args: {
  userId: string;
  workspaceId: string;
  role: string;
}): SessionAuthorizationActor {
  return {
    type: "session",
    userId: args.userId,
    workspaceId: args.workspaceId,
    capabilities: capabilitySetForRole(args.role),
  };
}

export function apiKeyActorFromScopes(args: {
  keyId: string;
  workspaceId: string;
  scopes: readonly string[];
}): ApiKeyAuthorizationActor {
  return {
    type: "api_key",
    keyId: args.keyId,
    workspaceId: args.workspaceId,
    capabilities: capabilitySetFromScopeAllowlist(args.scopes),
  };
}

export function actorHasProductCapability(
  actor: AuthorizationActor,
  capability: ProductCapabilityId,
): boolean {
  return actor.capabilities.has(asCapabilityId(capability));
}
