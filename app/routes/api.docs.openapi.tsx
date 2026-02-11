import type { LoaderFunctionArgs } from "@remix-run/node";
import { openApiSpec } from "@/lib/openapi";

/**
 * Serves the OpenAPI 3.0 spec as JSON for the docs UI (Scalar) and external tools.
 * GET /api/docs/openapi
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
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
};
