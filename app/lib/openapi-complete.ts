/**
 * Complete classified OpenAPI 3.0 spec for all CallCaster HTTP API surfaces.
 * Served at /api/docs/openapi/all.
 */
import { getCompleteOpenApiEntries } from "@/lib/api-surface";
import { buildOpenApiSpec } from "@/lib/openapi-build";

export const completeOpenApiSpec = buildOpenApiSpec({
  entries: getCompleteOpenApiEntries(),
  title: "CallCaster Complete API Surface",
  description:
    "Full classified inventory: user-facing routes (also in /api/docs/openapi), provider webhooks (Twilio/Stripe), internal telephony workers, and documented security gaps.",
  tagStrategy: "auth",
  useIntegratorPathOverrides: true,
  includeIntegratorSchemas: true,
  unsupportedDescription:
    "**Not supported for external use.** Webhook, internal, or security-gap route.",
});
