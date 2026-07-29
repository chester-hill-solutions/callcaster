import {
  asCapabilityId,
  CapabilityDeniedError,
  requireActorCapability,
  type AuthorizationActor,
} from "@chester-hill-solutions/auth";
import { createRequireCapability } from "@chester-hill-solutions/auth-react-router";
import type { RouterContextProvider, LoaderFunctionArgs } from "react-router";
import {
  apiKeyActorFromScopes,
  sessionActorFromMembership,
} from "@/lib/capability-actor.server";
import type { ProductCapabilityId } from "@/lib/capabilities";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { defineLoader } from "@/lib/handler.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
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
 * Handler-factory auth strategy for data-plane loaders/actions that only need
 * `workspaceId` + a product capability. Prefer this over inlining the same
 * workspaceId check + {@link requireDataPlaneRouteCapability} call.
 */
export function dataPlaneCapabilityAuth(capability: ProductCapabilityId) {
  return async ({
    params,
    context,
  }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    return requireDataPlaneRouteCapability(context, workspaceId, capability);
  };
}

/**
 * Auth strategy that gates on a capability then attaches one extra route param.
 */
export function dataPlaneCapabilityAuthWithParam<P extends string>(
  capability: ProductCapabilityId,
  paramName: P,
) {
  const base = dataPlaneCapabilityAuth(capability);
  return async (args: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const value = args.params[paramName];
    if (!value) {
      return jsonError(`workspaceId and ${paramName} are required`, 400);
    }
    const gated = await base(args);
    if (gated instanceof Response) return gated;
    return Object.assign(gated, { [paramName]: value } as Record<P, string>);
  };
}

type ListFail = { ok: false; error: string; status: number };

/** Shared defineLoader shape for workspace-scoped list endpoints. */
export function defineDataPlaneListLoader<K extends string>(config: {
  capability: ProductCapabilityId;
  key: K;
  list: (
    workspaceId: string,
  ) => Promise<({ ok: true } & Record<K, unknown>) | ListFail>;
}) {
  return defineLoader({
    auth: dataPlaneCapabilityAuth(config.capability),
    sideEffects: ["db-read"],
    handler: async ({ auth }) => {
      const result = await config.list(auth.workspaceId);
      if (!result.ok) {
        return jsonError(result.error, result.status);
      }
      return jsonResponse({ [config.key]: result[config.key] }, 200);
    },
  });
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
