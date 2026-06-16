import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOutboundSmsWebhookBody,
  cancelQueuedMessages,
  coerceWebhookHeaders,
  normalizeTwilioSmsStatus,
  pickRawTwilioSmsStatus,
  sendOutboundSmsWebhookIfConfigured,
  shouldUpdateOutreachDisposition,
} from "../_shared/sms-status-logic.ts";

Deno.test("pickRawTwilioSmsStatus prefers SmsStatus over MessageStatus", () => {
  assertEquals(
    pickRawTwilioSmsStatus({ SmsStatus: "delivered", MessageStatus: "failed" }),
    "delivered",
  );
  assertEquals(
    pickRawTwilioSmsStatus({ SmsStatus: "", MessageStatus: "sent" }),
    "sent",
  );
});

Deno.test("normalizeTwilioSmsStatus maps unknown to failed", () => {
  assertEquals(normalizeTwilioSmsStatus("delivered"), "delivered");
  assertEquals(normalizeTwilioSmsStatus("DELIVERED"), "delivered");
  assertEquals(normalizeTwilioSmsStatus("not-a-status"), "failed");
});

Deno.test("shouldUpdateOutreachDisposition blocks terminal transitions", () => {
  assertEquals(
    shouldUpdateOutreachDisposition({
      currentDisposition: "delivered",
      nextDisposition: "failed",
    }),
    false,
  );
  assertEquals(
    shouldUpdateOutreachDisposition({
      currentDisposition: "in-progress",
      nextDisposition: "delivered",
    }),
    true,
  );
});

Deno.test("coerceWebhookHeaders stringifies values", () => {
  assertEquals(coerceWebhookHeaders({ a: 1, b: true, c: "x" }), {
    a: "1",
    b: "true",
    c: "x",
  });
  assertEquals(coerceWebhookHeaders(null), {});
});

Deno.test("buildOutboundSmsWebhookBody shape is stable", () => {
  const body = buildOutboundSmsWebhookBody({
    workspaceId: "w1",
    message: { sid: "SM1", from: "+1", to: "+2", body: "hi", status: "sent" },
  });
  assertEquals(body.event_category, "outbound_sms");
  assertEquals(body.payload.record.message_sid, "SM1");
});

Deno.test("cancelQueuedMessages no-ops without campaign id", async () => {
  const supabase = {
    from: () => {
      throw new Error("should not query");
    },
  };
  await cancelQueuedMessages({ supabase, campaignId: "" });
});

Deno.test("sendOutboundSmsWebhookIfConfigured posts when configured", async () => {
  let called = false;
  const fetchImpl = async (url: string, init: RequestInit) => {
    called = true;
    assertEquals(url, "http://example.test/webhook");
    assertEquals(init.method, "POST");
    return new Response("ok", { status: 200 });
  };
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          filter: async () => ({
            data: [{
              destination_url: "http://example.test/webhook",
              custom_headers: { "X-Test": 123 },
            }],
            error: null,
          }),
        }),
      }),
    }),
  };

  await sendOutboundSmsWebhookIfConfigured({
    supabase,
    workspaceId: "w1",
    message: { sid: "SM1", status: "delivered" },
    fetchImpl,
  });
  assertEquals(called, true);
});

Deno.test("sendOutboundSmsWebhookIfConfigured throws on non-ok responses", async () => {
  const fetchImpl = async () => new Response("bad", { status: 500 });
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          filter: async () => ({
            data: [{ destination_url: "http://example.test/webhook" }],
            error: null,
          }),
        }),
      }),
    }),
  };

  await assertRejects(
    () =>
      sendOutboundSmsWebhookIfConfigured({
        supabase,
        workspaceId: "w1",
        message: { sid: "SM1", status: "delivered" },
        fetchImpl,
      }),
    Error,
    "Webhook request failed with status 500",
  );
});
