/**
 * Canonical inventory of integrator-facing public API paths.
 * Keep in sync with OpenAPI paths and contract tests.
 */
export const PUBLIC_API_PATHS = [
  "/api/campaigns/create-with-script",
  "/api/chat_sms",
  "/api/sms",
] as const;

export type PublicApiPath = (typeof PUBLIC_API_PATHS)[number];

export const PUBLIC_API_TAG = "Public" as const;
