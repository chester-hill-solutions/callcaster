import { describe, expect, test, vi } from "vitest";
import {
  buildOutboundSmsWebhookBody,
  coerceWebhookHeaders,
  normalizeTwilioSmsStatus,
  pickRawTwilioSmsStatus,
  sendOutboundSmsWebhookIfConfigured,
  shouldUpdateOutreachDisposition,
} from "../supabase/functions/_shared/sms-status-logic.ts";

describe("sms-status shared logic", () => {
  test("pickRawTwilioSmsStatus prefers SmsStatus over MessageStatus", () => {
    expect(
      pickRawTwilioSmsStatus({ SmsStatus: "delivered", MessageStatus: "failed" }),
    ).toBe("delivered");
    expect(pickRawTwilioSmsStatus({ SmsStatus: "", MessageStatus: "sent" })).toBe(
      "sent",
    );
  });

  test("normalizeTwilioSmsStatus maps unknown to failed", () => {
    expect(normalizeTwilioSmsStatus("delivered")).toBe("delivered");
    expect(normalizeTwilioSmsStatus("not-a-status")).toBe("failed");
  });

  test("shouldUpdateOutreachDisposition blocks terminal -> different", () => {
    expect(
      shouldUpdateOutreachDisposition({
        currentDisposition: "delivered",
        nextDisposition: "failed",
      }),
    ).toBe(false);
    expect(
      shouldUpdateOutreachDisposition({
        currentDisposition: "in-progress",
        nextDisposition: "delivered",
      }),
    ).toBe(true);
  });

  test("coerceWebhookHeaders stringifies values", () => {
    expect(coerceWebhookHeaders({ a: 1, b: true, c: "x" })).toEqual({
      a: "1",
      b: "true",
      c: "x",
    });
  });

  test("buildOutboundSmsWebhookBody shape is stable", () => {
    const body = buildOutboundSmsWebhookBody({
      workspaceId: "w1",
      message: { sid: "SM1", from: "+1", to: "+2", body: "hi", status: "sent" },
    });
    expect(body).toMatchObject({
      event_category: "outbound_sms",
      event_type: "UPDATE",
      workspace_id: "w1",
      payload: {
        type: "outbound_sms",
        record: { message_sid: "SM1", status: "sent" },
        old_record: { message_sid: "SM1" },
      },
    });
  });

  test("sendOutboundSmsWebhookIfConfigured sends POST with merged headers", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            filter: async () => ({
              data: [
                {
                  destination_url: "http://example.test/webhook",
                  custom_headers: { "X-Test": 123 },
                },
              ],
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

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [_url, req] = fetchImpl.mock.calls[0];
    expect(_url).toBe("http://example.test/webhook");
    expect(req.method).toBe("POST");
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.headers["X-Test"]).toBe("123");
  });

  test("sendOutboundSmsWebhookIfConfigured throws on non-ok responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 500 }));
    const supabase: any = {
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

    await expect(
      sendOutboundSmsWebhookIfConfigured({
        supabase,
        workspaceId: "w1",
        message: { sid: "SM1", status: "delivered" },
        fetchImpl,
      }),
    ).rejects.toThrow("Webhook request failed with status 500");
  });
});

