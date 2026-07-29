import {
  isUserFacingAuthClass,
} from "@/lib/public-api";
import type {
  ApiSurfaceEntry,
  AuthClass,
  BodyType,
  HttpMethod,
  OwnerArea,
} from "@/lib/api-surface-types";
import { PLATFORM_API_SURFACE } from "@/lib/api-surface-platform";
import {
  AUTH_CLASSES,
  BODY_TYPES,
  EXPOSURE_CLASSES,
  OWNER_AREAS,
  SPEC_TARGETS,
  surfaceEntryKey,
} from "@/lib/api-surface-types";

export type {
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

import { INTERNAL_API_SURFACE_1 } from "@/lib/api-surface-internal-1";
import { INTERNAL_API_SURFACE_2 } from "@/lib/api-surface-internal-2";

/** Canonical inventory of callable HTTP API surfaces. */
export const API_SURFACE: readonly ApiSurfaceEntry[] = [
  ...INTERNAL_API_SURFACE_1,
  ...INTERNAL_API_SURFACE_2,
  ...PLATFORM_API_SURFACE,
];

/** Flat map keyed by `METHOD /path` (includes duplicate legacy modules). */
export const API_SURFACE_BY_KEY = new Map(
  API_SURFACE.flatMap((entry) =>
    entry.operations.map((op) => [
      surfaceEntryKey(entry.path, op.method),
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
