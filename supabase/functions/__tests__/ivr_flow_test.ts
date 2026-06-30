import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test(
  {
    name: "ivr-flow returns error TwiML when CallSid is missing",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    Deno.env.set("SUPABASE_URL", "http://localhost");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

    const { handleRequest } = await import("../ivr-flow/index.ts" as string);
    const form = new FormData();
    const response = await handleRequest(
      new Request("http://localhost/ivr-flow", {
        method: "POST",
        body: form,
      }),
    );

    assertEquals(response.status, 500);
    assertEquals(response.headers.get("Content-Type"), "text/xml");
    const body = await response.text();
    assertStringIncludes(body, "An error occurred");
    assertStringIncludes(body, "<Hangup");
  },
);

Deno.test(
  {
    name: "ivr-flow rejects invalid Twilio signatures",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    sid: "CA123",
                    workspace: "ws-1",
                    outreach_attempt: {
                      id: 1,
                      result: {},
                      current_step: "page_1:block_1",
                    },
                    campaign: {
                      script: { steps: { blocks: {}, pages: {} } },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    twilio_data: { sid: "AC01", authToken: "test-token" },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { handleRequest } = await import("../ivr-flow/index.ts" as string);
    const form = new FormData();
    form.set("CallSid", "CA123");
    const response = await handleRequest(
      new Request("http://localhost/ivr-flow", {
        method: "POST",
        headers: { "x-twilio-signature": "invalid-signature" },
        body: form,
      }),
      { supabase: mockSupabase as never },
    );

    assertEquals(response.status, 403);
    assertEquals(await response.text(), "Invalid Twilio signature");
  },
);
