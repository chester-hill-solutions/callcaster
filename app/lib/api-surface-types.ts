/**
 * Typed enums for the complete API surface inventory.
 * Used by inventory, OpenAPI complete spec, coverage gate, and docs generators.
 */

export const AUTH_CLASSES = [
  "apiKeyOrSession",
  "session",
  "workspaceAdmin",
  "twilioSignature",
  "stripeSignature",
  "publicForm",
  "internalTrusted",
  "weakUnknown",
] as const;

export type AuthClass = (typeof AUTH_CLASSES)[number];

export const BODY_TYPES = [
  "json",
  "form",
  "multipart",
  "rawWebhook",
  "twiml",
  "query",
] as const;

export type BodyType = (typeof BODY_TYPES)[number];

export const OWNER_AREAS = [
  "auth",
  "campaigns",
  "contacts",
  "audiences",
  "scripts",
  "queues",
  "messaging",
  "telephony",
  "ivr",
  "inbound",
  "handset",
  "dialer",
  "workspace",
  "analytics",
  "billing",
  "surveys",
  "media",
  "docs",
  "misc",
] as const;

export type OwnerArea = (typeof OWNER_AREAS)[number];

export const EXPOSURE_CLASSES = [
  "publicSdk",
  "sessionOnly",
  "providerOnly",
  "internalOnly",
  "unsupported",
  "publicUnauthenticated",
] as const;

export type ExposureClass = (typeof EXPOSURE_CLASSES)[number];

export const SPEC_TARGETS = [
  "publicOpenApi",
  "completeOpenApi",
  "inventoryOnly",
] as const;

export type SpecTarget = (typeof SPEC_TARGETS)[number];

export const HANDLER_TYPES = ["loader", "action", "both"] as const;

export type HandlerType = (typeof HANDLER_TYPES)[number];

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** OpenAPI / docs grouping tags derived from auth class. */
export const AUTH_CLASS_TAGS: Record<AuthClass, string> = {
  apiKeyOrSession: "Integrator API",
  session: "User API",
  workspaceAdmin: "Workspace Admin",
  twilioSignature: "Provider Webhook",
  stripeSignature: "Provider Webhook",
  publicForm: "Public Form",
  internalTrusted: "Internal Trusted",
  weakUnknown: "Security Gap",
};

export type ApiSurfaceOperation = {
  method: HttpMethod;
  handler: "loader" | "action";
  bodyType: BodyType;
  /** Product capability ID enforced for this operation (SEC-07). */
  capability?: string;
};

export type ApiSurfaceEntry = {
  /** Full path including /api prefix. */
  path: string;
  routeModule: string;
  operations: readonly ApiSurfaceOperation[];
  authClass: AuthClass;
  ownerArea: OwnerArea;
  exposure: ExposureClass;
  /** Integrator-safe supported endpoint. */
  supported: boolean;
  specTarget: SpecTarget;
  /** Human docs guide path under docs/ */
  docsGuide: string;
  notes?: string;
  securityWarning?: string;
  /** Marks duplicate path registrations (legacy overlap). */
  duplicate?: boolean;
  duplicateGroup?: string;
  workspaceScoped?: boolean;
};

/**
 * ── The generated core ──────────────────────────────────────────────────
 *
 * Everything below is DERIVED from the code by scripts/generate-api-surface.ts
 * (issue #1242, D4) and written to app/lib/api-surface-generated.ts. It is the
 * half of an inventory entry that the codebase already states authoritatively:
 * the route tree gives the path and module, the route shim gives loader/action,
 * the handler gives the methods, and the auth strategy gives the capability.
 *
 * The editorial half — what a surface is FOR, which guide documents it, how a
 * body is encoded — cannot be read off the code and lives in
 * app/lib/api-surface-annotations.ts. `API_SURFACE` is the two merged.
 */
export type ApiSurfaceCoreOperation = {
  method: HttpMethod;
  handler: "loader" | "action";
  /** Capability the auth strategy brands itself with. */
  capability?: string;
  /**
   * Present when the capability comes from scripts/capability-baseline.json
   * rather than a capability-carrying strategy — a body-resolved preamble D3
   * has not migrated yet. Marked, never guessed.
   */
  capabilitySource?: "baseline";
};

export type ApiSurfaceCore = {
  path: string;
  routeModule: string;
  /**
   * Set when an AUTHORITATIVE auth strategy fixes the class outright. `null`
   * when the handler only uses a base helper (or nothing recognisable), in
   * which case the annotation supplies the class — see the derivation module
   * for why deriving from a base would understate real enforcement.
   */
  authClass: AuthClass | null;
  /** Human-readable trace of which strategies produced `authClass`. */
  authVia: string;
  operations: readonly ApiSurfaceCoreOperation[];
};

/**
 * The hand-written half, keyed by `routeModule` (unique per entry, and stable
 * across path changes). A generated route with no annotation fails the gate,
 * and so does an annotation for a route that no longer exists.
 */
export type ApiSurfaceAnnotation = {
  ownerArea: OwnerArea;
  exposure: ExposureClass;
  docsGuide: string;
  /** Request encoding for non-GET operations; loaders are always `query`. */
  bodyType?: BodyType;
  /** Per-method override for the rare route that mixes encodings. */
  bodyTypeByMethod?: Partial<Record<HttpMethod, BodyType>>;
  /**
   * Required only when the generated core could not determine the class.
   * Supplying one that contradicts an authoritative derivation is a gate
   * failure, not an override.
   */
  authClass?: AuthClass;
  notes?: string;
  securityWarning?: string;
  duplicate?: boolean;
  duplicateGroup?: string;
  workspaceScoped?: boolean;
  /** Overrides the default derived from auth class + exposure. */
  specTarget?: SpecTarget;
  supported?: boolean;
};

export function surfaceEntryKey(path: string, method: HttpMethod): string {
  return `${method} ${path}`;
}

export function assertExhaustiveAuthClass(value: never): never {
  throw new Error(`Unhandled auth class: ${String(value)}`);
}
