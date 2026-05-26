import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test(
  {
    name: "sms-handler returns campaign_completed when campaign is inactive",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table !== "campaign") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  is_active: false,
                  sms_send_mode: null,
                  sms_messaging_service_sid: null,
                  caller_id: "+15551234567",
                },
                error: null,
              }),
            }),
          }),
        };
      },
    };

    const { handleRequest } = await import("../sms-handler/index.ts" as string);
    const response = await handleRequest(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_number: "+15559876543",
          campaign_id: 7,
          workspace_id: "ws-1",
          contact_id: 11,
          caller_id: "+15551234567",
          queue_id: 99,
          user_id: "user-1",
        }),
      }),
      { supabase: mockSupabase as never },
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: "campaign_completed" });
  },
);
