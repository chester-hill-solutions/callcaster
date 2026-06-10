import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("twilio-billing-reconcile rejects non-POST requests", async () => {
  const { handleRequest } = await import(
    "../twilio-billing-reconcile/index.ts" as string
  );
  const response = await handleRequest(
    new Request("http://localhost/twilio-billing-reconcile", { method: "GET" }),
  );

  assertEquals(response.status, 405);
  assertEquals(await response.json(), { error: "POST required" });
});

Deno.test(
  {
    name: "twilio-billing-reconcile returns empty summary when no workspaces",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table !== "workspace") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          select: () => ({
            not: async () => ({ data: [], error: null }),
          }),
        };
      },
    };

    const { handleRequest } = await import(
      "../twilio-billing-reconcile/index.ts" as string
    );
    const response = await handleRequest(
      new Request("http://localhost/twilio-billing-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { supabase: mockSupabase as never },
    );

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.scanned, 0);
    assertEquals(body.reconciled, 0);
    assertEquals(body.materialVarianceCount, 0);
  },
);
