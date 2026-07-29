import {
  asCapabilityId,
  CapabilityDeniedError,
  requireActorCapability,
  type AuthorizationActor,
} from "@chester-hill-solutions/auth";
import { createRequireCapability } from "@chester-hill-solutions/auth-react-router";
import type { RouterContextProvider } from "react-router";
import {
  apiKeyActorFromScopes,
  sessionActorFromMembership,
} from "@/lib/capability-actor.server";
import type { ProductCapabilityId } from "@/lib/capabilities";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { jsonError } from "@/lib/platform-api.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";
import type {
  ApiKeyAuthResult,
  BearerSessionAuthResult,
  SessionAuthResult,
} from "@/lib/api-auth.server";

function capabilityDeniedResponse(error: CapabilityDeniedError): Response {
  return jsonError(
    error.message,
    403,
    `capability_denied:${error.capabilityId}`,
  );
}

/**
 * Resolve an AuthorizationActor for data-plane middleware context
 * (session membership role or API-key scope allowlist).
 */
export async function resolveDataPlaneAuthorizationActor(
  auth: DataPlaneAuthContextValue,
): Promise<AuthorizationActor | Response> {
  if (auth.apiKey) {
    return apiKeyActorFromScopes({
      keyId: auth.apiKey.keyId,
      workspaceId: auth.workspaceId,
      scopes: auth.apiKey.scopes,
    });
  }

  if (!auth.userId) {
    return jsonError("Unauthorized", 401);
  }

  const membership = await getUserRole({
    user: { id: auth.userId },
    workspaceId: auth.workspaceId,
  });
  if (!membership) {
    // Preserve ADR-0004: non-members look like missing workspaces.
    return jsonError("Workspace not found", 404);
  }

  return sessionActorFromMembership({
    userId: auth.userId,
    workspaceId: auth.workspaceId,
    role: membership.role,
  });
}

/**
 * Require a product capability on an already-authenticated data-plane request.
 * Returns the actor on success, or a 403/404 Response.
 */
export async function requireDataPlaneCapability(
  auth: DataPlaneAuthContextValue,
  capability: ProductCapabilityId,
): Promise<AuthorizationActor | Response> {
  const actor = await resolveDataPlaneAuthorizationActor(auth);
  if (actor instanceof Response) {
    return actor;
  }
  try {
    requireActorCapability(actor, asCapabilityId(capability));
    return actor;
  } catch (error) {
    if (error instanceof CapabilityDeniedError) {
      return capabilityDeniedResponse(error);
    }
    throw error;
  }
}

/**
 * Resolve data-plane auth context and require a product capability.
 * Returns `{ workspaceId, auth }` or a 403/404 Response.
 */
export async function requireDataPlaneRouteCapability(
  context: Readonly<RouterContextProvider>,
  workspaceId: string,
  capability: ProductCapabilityId,
): Promise<{ workspaceId: string; auth: DataPlaneAuthContextValue } | Response> {
  const auth = getDataPlaneRouteContext(context, workspaceId);
  const gated = await requireDataPlaneCapability(auth, capability);
  if (gated instanceof Response) {
    return gated;
  }
  return { workspaceId, auth };
}

/**
 * Build an AuthorizationActor from a dual-auth result once workspaceId is known.
 */
export async function resolveDualAuthAuthorizationActor(args: {
  auth: ApiKeyAuthResult | BearerSessionAuthResult | SessionAuthResult;
  workspaceId: string;
}): Promise<AuthorizationActor | Response> {
  const { auth, workspaceId } = args;
  if (auth.authType === "api_key") {
    if (auth.workspaceId !== workspaceId) {
      return jsonError("workspaceId does not match API key", 403);
    }
    return apiKeyActorFromScopes({
      keyId: auth.keyId,
      workspaceId,
      scopes: auth.scopes,
    });
  }

  const membership = await getUserRole({
    user: { id: auth.user.id },
    workspaceId,
  });
  if (!membership) {
    return jsonError("Workspace not found", 404);
  }

  return sessionActorFromMembership({
    userId: auth.user.id,
    workspaceId,
    role: membership.role,
  });
}

export async function requireDualAuthCapability(args: {
  auth: ApiKeyAuthResult | BearerSessionAuthResult | SessionAuthResult;
  workspaceId: string;
  capability: ProductCapabilityId;
}): Promise<AuthorizationActor | Response> {
  const actor = await resolveDualAuthAuthorizationActor(args);
  if (actor instanceof Response) {
    return actor;
  }
  try {
    requireActorCapability(actor, asCapabilityId(args.capability));
    return actor;
  } catch (error) {
    if (error instanceof CapabilityDeniedError) {
      return capabilityDeniedResponse(error);
    }
    throw error;
  }
}

/**
 * Package factory wired to CallCaster data-plane actor resolution.
 * Prefer `requireDataPlaneCapability` for middleware-backed routes.
 */
export function createDataPlaneRequireCapability(
  capability: ProductCapabilityId,
) {
  return createRequireCapability({
    capabilityId: asCapabilityId(capability),
    resolveActor: async ({ workspaceId, userId }) => {
      // Session path only — API keys should use requireDataPlaneCapability with
      // full data-plane context (scopes live on the key, not userId).
      const membership = await getUserRole({
        user: { id: userId },
        workspaceId,
      });
      if (!membership) {
        return jsonError("Workspace not found", 404);
      }
      return sessionActorFromMembership({
        userId,
        workspaceId,
        role: membership.role,
      });
    },
    onDenied: capabilityDeniedResponse,
  });
}
