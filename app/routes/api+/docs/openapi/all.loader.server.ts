import { completeOpenApiSpec } from "@/lib/openapi-complete";
import { defineLoader } from "@/lib/handler.server";

/**
 * Serves the complete classified API surface OpenAPI spec as JSON.
 * GET /api/docs/openapi/all
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

    return new Response(JSON.stringify(completeOpenApiSpec), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  },
});
