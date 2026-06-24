/**
 * OpenAPI 3.0 spec for CallCaster user-facing API.
 * Served at /api/docs/openapi — workspace, campaigns, contacts, telephony, and integrator routes.
 */
import { getPublicOpenApiEntries } from "@/lib/api-surface";
import { buildOpenApiSpec } from "@/lib/openapi-build";

export const openApiSpec = buildOpenApiSpec({
  entries: getPublicOpenApiEntries(),
  title: "CallCaster API",
  description:
    "User-facing HTTP API for CallCaster: control workspaces, campaigns, contacts, audiences, scripts, dialer/call-screen flows, and messaging. Authenticate with a browser session cookie (signed-in user) or workspace API key (automation). Webhooks, internal telephony workers, and undocumented security gaps are in the complete surface spec at /api/docs/openapi/all.",
  tagStrategy: "owner",
  useIntegratorPathOverrides: true,
  usePlatformPathOverrides: true,
  includeIntegratorSchemas: true,
  includePlatformSchemas: true,
});
