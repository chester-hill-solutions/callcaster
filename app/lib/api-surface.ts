/**
 * Canonical inventory of callable HTTP API surfaces.
 *
 * `API_SURFACE` used to be a 1,760-line literal split across four files, with
 * a cross-file ordering invariant nothing enforced. It is now assembled from
 * two halves (issue #1242, D4):
 *
 *   app/lib/api-surface-generated.ts    GENERATED — path, module, methods,
 *                                       enforced capability, and the auth
 *                                       class wherever a strategy fixes it.
 *   app/lib/api-surface-annotations.ts  HAND-WRITTEN — what a surface is for,
 *                                       which guide documents it, how bodies
 *                                       are encoded, and the auth class where
 *                                       the code does not state it.
 *
 * Consumers see the same `ApiSurfaceEntry[]` they always did. What changed is
 * that the derivable half can no longer drift from the code: `npm run
 * tools:api:surface:check` regenerates it and cross-checks the annotations.
 */
import { isUserFacingAuthClass } from "@/lib/public-api";
import type {
  ApiSurfaceAnnotation,
  ApiSurfaceCore,
  ApiSurfaceEntry,
  ApiSurfaceOperation,
  AuthClass,
  BodyType,
  HttpMethod,
} from "@/lib/api-surface-types";
import { surfaceEntryKey } from "@/lib/api-surface-types";
import { API_SURFACE_CORE } from "@/lib/api-surface-generated";
import { API_SURFACE_ANNOTATIONS } from "@/lib/api-surface-annotations";

export type {
  ApiSurfaceAnnotation,
  ApiSurfaceCore,
  ApiSurfaceEntry,
  ApiSurfaceOperation,
  AuthClass,
  BodyType,
  ExposureClass,
  HandlerType,
  HttpMethod,
  OwnerArea,
  SpecTarget,
} from "@/lib/api-surface-types";

export {
  AUTH_CLASSES,
  AUTH_CLASS_TAGS,
  BODY_TYPES,
  EXPOSURE_CLASSES,
  HTTP_METHODS,
  OWNER_AREAS,
  SPEC_TARGETS,
  surfaceEntryKey,
} from "@/lib/api-surface-types";

export { API_SURFACE_CORE } from "@/lib/api-surface-generated";
export { API_SURFACE_ANNOTATIONS } from "@/lib/api-surface-annotations";

/**
 * Surfaces that never belong in the public integrator spec: duplicates,
 * explicitly unsupported routes, and anything authenticated by something other
 * than a user credential (provider signatures, internal trust).
 */
function isCompleteOnlySurface(
  authClass: AuthClass,
  annotation: ApiSurfaceAnnotation,
): boolean {
  if (annotation.duplicate) return true;
  if (annotation.exposure === "unsupported") return true;
  return !isUserFacingAuthClass(authClass);
}

function bodyTypeFor(
  op: ApiSurfaceCore["operations"][number],
  annotation: ApiSurfaceAnnotation,
): BodyType {
  if (op.handler === "loader") return "query";
  return (
    annotation.bodyTypeByMethod?.[op.method] ?? annotation.bodyType ?? "json"
  );
}

function assemble(
  core: ApiSurfaceCore,
  annotation: ApiSurfaceAnnotation,
): ApiSurfaceEntry {
  const authClass = core.authClass ?? annotation.authClass;
  if (!authClass) {
    throw new Error(
      `api-surface: ${core.path} (${core.routeModule}) has no derived auth class and no declared one in api-surface-annotations.ts`,
    );
  }

  const specTarget =
    annotation.specTarget ??
    (isCompleteOnlySurface(authClass, annotation)
      ? "completeOpenApi"
      : "publicOpenApi");

  const supported =
    annotation.supported ??
    (specTarget === "publicOpenApi" && authClass !== "weakUnknown");

  const operations: ApiSurfaceOperation[] = core.operations.map((op) => ({
    method: op.method,
    handler: op.handler,
    bodyType: bodyTypeFor(op, annotation),
    ...(op.capability ? { capability: op.capability } : {}),
  }));

  return {
    path: core.path,
    routeModule: core.routeModule,
    operations,
    authClass,
    ownerArea: annotation.ownerArea,
    exposure: annotation.exposure,
    supported,
    specTarget,
    docsGuide: annotation.docsGuide,
    notes: annotation.notes,
    securityWarning: annotation.securityWarning,
    duplicate: annotation.duplicate,
    duplicateGroup: annotation.duplicateGroup,
    workspaceScoped: annotation.workspaceScoped,
  };
}

/** Canonical inventory of callable HTTP API surfaces. */
export const API_SURFACE: readonly ApiSurfaceEntry[] = API_SURFACE_CORE.map(
  (core) => {
    const annotation = API_SURFACE_ANNOTATIONS[core.routeModule];
    if (!annotation) {
      throw new Error(
        `api-surface: no annotation for generated route ${core.path} (${core.routeModule}) — add one to app/lib/api-surface-annotations.ts`,
      );
    }
    return assemble(core, annotation);
  },
);

/** Flat map keyed by `METHOD /path` (includes duplicate legacy modules). */
export const API_SURFACE_BY_KEY = new Map(
  API_SURFACE.flatMap((entry) =>
    entry.operations.map((op) => [
      surfaceEntryKey(entry.path, op.method as HttpMethod),
      { entry, operation: op },
    ]),
  ),
);

export function getPublicOpenApiEntries(): ApiSurfaceEntry[] {
  return API_SURFACE.filter((e) => e.specTarget === "publicOpenApi");
}

export function getCompleteOpenApiEntries(): ApiSurfaceEntry[] {
  return API_SURFACE.filter((e) => e.specTarget !== "inventoryOnly");
}

export function getPublicOpenApiPathsFromInventory(): string[] {
  return API_SURFACE.filter((e) => e.specTarget === "publicOpenApi").map(
    (e) => e.path,
  );
}

export const API_SURFACE_GUIDES = [
  "docs/api-auth-matrix.md",
  "docs/api-surface-inventory.md",
  "docs/api-workspace-admin.md",
  "docs/api-data-management.md",
  "docs/api-data-plane.md",
  "docs/api-analytics-export.md",
  "docs/api-telephony-control.md",
  "docs/api-telephony-provisioning.md",
  "docs/api-live-operations.md",
  "docs/api-webhooks.md",
  "docs/api-internal-unsupported.md",
  "docs/api-overview.md",
  "docs/api-agent-quickstart.md",
  "docs/api-admin.md",
  "docs/api-create-campaign-with-script.md",
  "docs/api-send-sms.md",
] as const;
