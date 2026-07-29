/**
 * Shared seed helpers + docs-guide maps for the API surface inventory files.
 * Extracted from api-surface.ts / api-surface-platform.ts so the entry lists
 * can be split under the app file-size gate (#1048) without duplicating the
 * shaping logic.
 */
import { isUserFacingAuthClass } from "@/lib/public-api";
import type {
  ApiSurfaceEntry,
  AuthClass,
  BodyType,
  HttpMethod,
  OwnerArea,
} from "@/lib/api-surface-types";

type Op = {
  method: HttpMethod;
  handler: "loader" | "action";
  bodyType: BodyType;
  capability?: string;
};

type Seed = {
  path: string;
  routeModule: string;
  authClass: AuthClass;
  ownerArea: OwnerArea;
  exposure: ApiSurfaceEntry["exposure"];
  supported?: boolean;
  specTarget?: ApiSurfaceEntry["specTarget"];
  docsGuide: string;
  operations: Op[];
  notes?: string;
  securityWarning?: string;
  duplicate?: boolean;
  duplicateGroup?: string;
  workspaceScoped?: boolean;
};

function isCompleteOnlySurface(input: Seed): boolean {
  if (input.duplicate) return true;
  if (input.exposure === "unsupported") return true;
  if (
    input.authClass === "weakUnknown" ||
    input.authClass === "internalTrusted" ||
    input.authClass === "twilioSignature" ||
    input.authClass === "stripeSignature"
  ) {
    return true;
  }
  return !isUserFacingAuthClass(input.authClass);
}

export function seed(input: Seed): ApiSurfaceEntry {
  const specTarget =
    input.specTarget ??
    (isCompleteOnlySurface(input) ? "completeOpenApi" : "publicOpenApi");

  const supported =
    input.supported ??
    (specTarget === "publicOpenApi" && input.authClass !== "weakUnknown");

  return {
    path: input.path,
    routeModule: input.routeModule,
    operations: input.operations,
    authClass: input.authClass,
    ownerArea: input.ownerArea,
    exposure: input.exposure,
    supported,
    specTarget,
    docsGuide: input.docsGuide,
    notes: input.notes,
    securityWarning: input.securityWarning,
    duplicate: input.duplicate,
    duplicateGroup: input.duplicateGroup,
    workspaceScoped: input.workspaceScoped,
  };
}

export const GUIDE = {
  auth: "docs/api-auth-matrix.md",
  workspace: "docs/api-workspace-admin.md",
  data: "docs/api-data-management.md",
  analytics: "docs/api-analytics-export.md",
  telephony: "docs/api-telephony-control.md",
  webhooks: "docs/api-webhooks.md",
  internal: "docs/api-internal-unsupported.md",
  overview: "docs/api-overview.md",
} as const;


// ─── Platform (agent-friendly CaaS) seed ───────────────────────────────

type PlatformOp = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  handler: "loader" | "action";
  bodyType: "json" | "query" | "form" | "multipart" | "twiml" | "rawWebhook";
  capability?: string;
};

type PlatformSeed = {
  path: string;
  routeModule: string;
  authClass: ApiSurfaceEntry["authClass"];
  ownerArea: ApiSurfaceEntry["ownerArea"];
  exposure: ApiSurfaceEntry["exposure"];
  docsGuide: string;
  operations: PlatformOp[];
  notes?: string;
  workspaceScoped?: boolean;
  duplicate?: boolean;
};

export function platformSeed(input: PlatformSeed): ApiSurfaceEntry {
  return {
    path: input.path,
    routeModule: input.routeModule,
    authClass: input.authClass,
    ownerArea: input.ownerArea,
    exposure: input.exposure,
    supported: true,
    specTarget: "publicOpenApi",
    docsGuide: input.docsGuide,
    operations: input.operations,
    notes: input.notes,
    workspaceScoped: input.workspaceScoped,
    duplicate: input.duplicate,
  };
}

export const PLATFORM_GUIDE = {
  auth: "docs/api-auth-matrix.md",
  platform: "docs/api-agent-quickstart.md",
  workspace: "docs/api-workspace-admin.md",
  data: "docs/api-data-plane.md",
  analytics: "docs/api-analytics-export.md",
  telephony: "docs/api-telephony-provisioning.md",
  live: "docs/api-live-operations.md",
  admin: "docs/api-admin.md",
} as const;

/** Platform / agent-friendly CaaS routes added for full API parity. */
