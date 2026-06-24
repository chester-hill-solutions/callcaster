import type { AuthClass } from "@/lib/api-surface-types";

/**
 * API-key integrator endpoints with detailed OpenAPI schemas and Hey API codegen.
 * Keep in sync with openapi-integrator.ts and contract tests.
 */
export const INTEGRATOR_API_PATHS = [
  "/api/campaigns/create-with-script",
  "/api/chat_sms",
  "/api/sms",
] as const;

/** @deprecated Use INTEGRATOR_API_PATHS — kept for existing imports/tests. */
export const PUBLIC_API_PATHS = INTEGRATOR_API_PATHS;

export type IntegratorApiPath = (typeof INTEGRATOR_API_PATHS)[number];
export type PublicApiPath = IntegratorApiPath;

export const INTEGRATOR_API_TAG = "Integrator API" as const;

/** @deprecated Use INTEGRATOR_API_TAG */
export const PUBLIC_API_TAG = INTEGRATOR_API_TAG;

/** Auth modes a signed-in or anonymous app user may call (not webhooks/internal). */
export const USER_FACING_AUTH_CLASSES = [
  "apiKeyOrSession",
  "session",
  "workspaceAdmin",
  "publicForm",
] as const satisfies readonly AuthClass[];

export type UserFacingAuthClass = (typeof USER_FACING_AUTH_CLASSES)[number];

export function isUserFacingAuthClass(
  authClass: AuthClass,
): authClass is UserFacingAuthClass {
  return (USER_FACING_AUTH_CLASSES as readonly AuthClass[]).includes(authClass);
}

export function isIntegratorApiPath(path: string): path is IntegratorApiPath {
  return (INTEGRATOR_API_PATHS as readonly string[]).includes(path);
}
