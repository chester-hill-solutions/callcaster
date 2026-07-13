import { completeOpenApiSpec } from "@/lib/openapi-complete";
import { defineLoader } from "@/lib/handler.server";
import { serveSpec } from "../spec-loader.server";

/**
 * Serves the complete classified API surface OpenAPI spec as JSON.
 * GET /api/docs/openapi/all
 */
export const loader = defineLoader({
  sideEffects: ["none"],
  handler: serveSpec(completeOpenApiSpec),
});
