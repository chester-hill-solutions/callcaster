import { openApiSpec } from "@/lib/openapi";
import { defineLoader } from "@/lib/handler.server";

/**
 * Serves the OpenAPI 3.0 spec as JSON for the docs UI (Scalar) and external tools.
 * GET /api/docs/openapi
 */
export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ request }) => {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(openApiSpec), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  },
});
