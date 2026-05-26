import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("twilio-open-sync rejects non-POST requests", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

  const { handleRequest } = await import("../twilio-open-sync/index.ts" as string);
  const response = await handleRequest(
    new Request("http://localhost/twilio-open-sync", { method: "GET" }),
  );

  assertEquals(response.status, 405);
  assertEquals(await response.json(), { error: "POST required" });
});

Deno.test(
  {
    name: "twilio-open-sync returns empty scan summary when no stale rows",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    const mockSupabase = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          gte: () => chain,
          in: () => chain,
          not: () => chain,
          or: () => chain,
          neq: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
        };
        if (table === "call" || table === "message") {
          return chain;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { handleRequest } = await import("../twilio-open-sync/index.ts" as string);
    const response = await handleRequest(
      new Request("http://localhost/twilio-open-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { supabase: mockSupabase as never },
    );

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.calls.scanned, 0);
    assertEquals(body.messages.scanned, 0);
    assertEquals(body.calls.ok, 0);
    assertEquals(body.messages.ok, 0);
  },
);
