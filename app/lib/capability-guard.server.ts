import {
  asCapabilityId,
  CapabilityDeniedError,
  requireActorCapability,
  type AuthorizationActor,
} from "@chester-hill-solutions/auth";
import type { RouterContextProvider, LoaderFunctionArgs } from "react-router";
import {
  apiKeyActorFromScopes,
  sessionActorFromMembership,
} from "@/lib/capability-actor.server";
import type { ProductCapabilityId } from "@/lib/capabilities";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { hasMinRole, type MemberRole } from "@/lib/member-role";
import { defineLoader, withEnforcedCapability } from "@/lib/handler.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";
import type {
  ApiKeyAuthResult,
  BearerSessionAuthResult,
  SessionAuthResult,
} from "@/lib/api-auth.server";
import { authForResource, type PlatformResourceKind } from "@/lib/platform-data.server";

function capabilityDeniedResponse(error: CapabilityDeniedError): Response {
  return jsonError(
    error.message,
    403,
    `capability_denied:${error.capabilityId}`,
  );
}

/**
 * Resolve an AuthorizationActor for data-plane middleware context
 * (session membership role or API-key scope allowlist). Internal: routes go
 * through {@link requireDataPlaneCapability}, which owns the denial shapes.
 */
async function resolveDataPlaneAuthorizationActor(
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
 *
 * The strategy is branded with `capability` — the same value it hands to
 * `requireActorCapability` — so the factory can propagate it to the handler
 * and `check:handlers` can cross-check the API_SURFACE declaration against
 * real enforcement instead of against a second, hand-written claim. Pass the
 * strategy to `auth:` directly; wrapping it in `(args) => strategy(...)(args)`
 * builds a fresh unbranded closure and breaks the link.
 */
export function dataPlaneCapabilityAuth(capability: ProductCapabilityId) {
  return withEnforcedCapability(capability, async ({
    params,
    context,
  }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    return requireDataPlaneRouteCapability(context, workspaceId, capability);
  });
}

/**
 * Handler-factory auth strategy for `sessionOnly` data-plane loaders/actions
 * that gate on a minimum workspace ROLE rather than a product capability.
 *
 * Sibling of {@link dataPlaneCapabilityAuth}, for the endpoints whose
 * authorization is a role floor and where no product capability exists
 * (billing reads, number provisioning). Deliberately does NOT resolve an
 * API-key actor: these routes are declared `exposure: "sessionOnly"`, and
 * `resolveDataPlaneAuth` gives API-key requests `userId: null`, so a key gets
 * the same 401 the hand-rolled preambles returned. Routing them through
 * capability actors instead would silently widen a session-only surface.
 *
 * Rejection shapes follow the established data-plane conventions:
 * - non-member → 404 "Workspace not found" (ADR-0004, existence hidden)
 * - member below `minRole` → 403 "Insufficient role", matching
 *   `createDataPlaneMiddlewareWithMinRole` in data-plane-middleware.server.ts
 */
export function dataPlaneSessionMinRoleAuth(minRole: MemberRole) {
  return async ({
    params,
    context,
  }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }
    const membership = await getUserRole({ user: { id: userId }, workspaceId });
    if (!membership) {
      return jsonError("Workspace not found", 404);
    }
    if (!hasMinRole(membership.role, minRole)) {
      return jsonError("Insufficient role", 403, "insufficient_role");
    }
    return { workspaceId, userId };
  };
}

/**
 * Handler-factory auth strategy for `sessionOnly` data-plane loaders/actions
 * that require nothing beyond workspace MEMBERSHIP — no capability, no role
 * floor above the lowest rank.
 *
 * Plain sibling of {@link dataPlaneSessionMinRoleAuth}: that one exists for
 * routes with a real role floor (`MemberRole.Admin`, `.Member`, ...); this one
 * is for the routes that only ever checked `!userId` after resolving the data
 * plane context — every workspace member, `caller` included, may proceed.
 * Deliberately does NOT resolve an API-key actor, for the same reason
 * {@link dataPlaneSessionMinRoleAuth} does not: these routes are declared
 * `exposure: "sessionOnly"`, and `resolveDataPlaneAuth` gives API-key requests
 * `userId: null`, so a key gets the same 401 the hand-rolled preambles
 * returned.
 *
 * Rejection shapes match the hand-rolled preambles this replaces:
 * - `workspaceId` missing from the route → 400 "workspaceId is required"
 * - workspace in context doesn't match the route param → 404 "Workspace not
 *   found" (thrown by {@link getDataPlaneRouteContext} itself, ADR-0004)
 * - no session user (API key or truly unauthenticated) → 401 "Unauthorized"
 */
export function dataPlaneSessionAuth() {
  return async ({
    params,
    context,
  }: Pick<LoaderFunctionArgs, "params" | "context">) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }
    return { workspaceId, userId };
  };
}

/**
 * Auth strategy that gates on a capability then attaches one extra route param.
 * Carries the same capability brand as {@link dataPlaneCapabilityAuth}.
 */
export function dataPlaneCapabilityAuthWithParam<P extends string>(
  capability: ProductCapabilityId,
  paramName: P,
) {
  const base = dataPlaneCapabilityAuth(capability);
  return withEnforcedCapability(capability, async (
    args: Pick<LoaderFunctionArgs, "params" | "context">,
  ) => {
    const value = args.params[paramName];
    if (!value) {
      return jsonError(`workspaceId and ${paramName} are required`, 400);
    }
    const gated = await base(args);
    if (gated instanceof Response) return gated;
    return Object.assign(gated, { [paramName]: value } as Record<P, string>);
  });
}

/**
 * Handler-factory auth strategy for data-plane loaders/actions gated on a
 * *resource* (campaign/contact/script/survey) whose owning workspace is
 * resolved from the resource id itself rather than a `workspaceId` route
 * param — sibling of {@link dataPlaneCapabilityAuth} for routes shaped
 * `/api/<resource>/:id` instead of `/api/workspaces/:workspaceId/...`.
 *
 * Wraps {@link authForResource} (id → workspace lookup + dual-auth check)
 * followed by {@link requireDataPlaneCapability} with the same `capability`
 * value used for the brand, so `check:handlers` can link these routes the
 * same way it links the workspaceId-param family.
 */
export function dataPlaneCapabilityAuthForResource<P extends string>(
  capability: ProductCapabilityId,
  kind: PlatformResourceKind,
  paramName: P,
  options?: { minRole?: string },
) {
  return withEnforcedCapability(capability, async ({
    request,
    params,
  }: Pick<LoaderFunctionArgs, "request" | "params">) => {
    const id = params[paramName];
    if (!id) {
      return jsonError(`${paramName} is required`, 400);
    }
    const auth = await authForResource(request, kind, id, options?.minRole);
    if (auth instanceof Response) return auth;

    const gated = await requireDataPlaneCapability(auth, capability);
    if (gated instanceof Response) return gated;

    return { ...auth, [paramName]: id } as typeof auth & Record<P, string>;
  });
}

type ListFail = { ok: false; error: string; status: number };

/**
 * Shared defineLoader shape for workspace-scoped list endpoints. `capability`
 * is forwarded straight into {@link dataPlaneCapabilityAuth}, so the loader it
 * returns inherits the capability brand like any other strategy-built handler.
 */
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
 * Build an AuthorizationActor from a dual-auth result once workspaceId is
 * known. Internal, for {@link requireDualAuthCapability}.
 */
async function resolveDualAuthAuthorizationActor(args: {
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

