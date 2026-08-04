import { openApiSpec } from "@/lib/openapi";
import { defineLoader } from "@/lib/handler.server";
import { serveSpec } from "./spec-loader.server";

/**
 * Serves the OpenAPI 3.0 spec as JSON for the docs UI (Scalar) and external tools.
 * GET /api/docs/openapi
 */
export const loader = defineLoader({
  sideEffects: ["none"],
  handler: serveSpec(openApiSpec),
});
