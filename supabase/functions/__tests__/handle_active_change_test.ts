import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function baseCampaignRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    title: "Test campaign",
    status: "pending",
    type: "live_call",
    start_date: "2020-01-01T00:00:00.000Z",
    end_date: "2099-01-01T00:00:00.000Z",
    created_at: "2020-01-01T00:00:00.000Z",
    voicemail_file: "",
    call_questions: {},
    workspace: "ws-1",
    caller_id: "+15551234567",
    group_household_queue: false,
    dial_type: null,
    dial_ratio: 1,
    schedule: null,
    is_active: false,
    ...overrides,
  };
}

Deno.test(
  {
    name: "handle_active_change returns no_action_needed when campaign is idle",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    Deno.env.set("SUPABASE_URL", "http://localhost");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

    const { handleRequest } = await import(
      "../handle_active_change/index.ts" as string
    );
    const response = await handleRequest(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: baseCampaignRecord() }),
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: "no_action_needed" });
  },
);

Deno.test(
  {
    name: "handle_active_change archives expired campaigns",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    const updates: unknown[] = [];
    const mockSupabase = {
      from: (table: string) => {
        if (table !== "campaign") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          update: (payload: unknown) => ({
            eq: async (_col: string, id: number) => {
              updates.push({ payload, id });
              return { error: null };
            },
          }),
        };
      },
    };

    const { handleRequest } = await import(
      "../handle_active_change/index.ts" as string
    );
    const response = await handleRequest(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record: baseCampaignRecord({
            status: "running",
            end_date: "2020-01-01T00:00:00.000Z",
          }),
        }),
      }),
      { supabase: mockSupabase as never },
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      status: "archived",
      message: "Campaign 42 has been archived",
    });
    assertEquals(updates.length, 1);
  },
);

Deno.test("getExpectedTwilioSignature is stable for fixed inputs", async () => {
  const { getExpectedTwilioSignature } = await import(
    "../handle_active_change/index.ts" as string
  );

  const signature = await getExpectedTwilioSignature(
    "12345",
    "https://example.com/webhook",
    { foo: "bar", digits: ["1", "2"] },
  );

  assertEquals(
    signature,
    await getExpectedTwilioSignature(
      "12345",
      "https://example.com/webhook",
      { foo: "bar", digits: ["1", "2"] },
    ),
  );
  assertEquals(signature.length > 0, true);
});
