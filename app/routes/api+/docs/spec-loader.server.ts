/** GET-only handler body serving an OpenAPI spec as cacheable JSON. */
export function serveSpec(spec: unknown) {
  return ({ request }: { request: Request }) => {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(spec), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  };
}
