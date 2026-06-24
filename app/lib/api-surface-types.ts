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

export function surfaceEntryKey(path: string, method: HttpMethod): string {
  return `${method} ${path}`;
}

export function assertExhaustiveAuthClass(value: never): never {
  throw new Error(`Unhandled auth class: ${String(value)}`);
}
