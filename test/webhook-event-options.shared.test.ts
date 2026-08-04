import { describe, expect, test } from "vitest";
import {
  encodeWebhookEventOption,
  eventConfigToSelectedSet,
  selectedSetToEventConfig,
  selectedSetToWebhookEvents,
  webhookEventsToSelectedSet,
  WEBHOOK_EVENT_OPTIONS,
} from "@/lib/webhook-event-options.shared";

describe("webhook-event-options.shared", () => {
  test("encodeWebhookEventOption builds stable picker values", () => {
    expect(encodeWebhookEventOption("inbound_call", "INSERT")).toBe(
      "inbound_call:INSERT",
    );
  });

  test("round-trips WebhookEvent[] through selected set", () => {
    const events = [
      { category: "inbound_call" as const, type: "INSERT" as const },
      { category: "voicemail" as const, type: "INSERT" as const },
      { category: "outbound_sms" as const, type: "UPDATE" as const },
    ];
    const selected = webhookEventsToSelectedSet(events);
    expect([...selected].sort()).toEqual([
      "inbound_call:INSERT",
      "outbound_sms:UPDATE",
      "voicemail:INSERT",
    ]);
    expect(selectedSetToWebhookEvents(selected)).toEqual(
      expect.arrayContaining(events),
    );
    expect(selectedSetToWebhookEvents(selected)).toHaveLength(events.length);
  });

  test("ignores DELETE events when building selected set", () => {
    const selected = webhookEventsToSelectedSet([
      { category: "inbound_call", type: "DELETE" },
      { category: "inbound_sms", type: "INSERT" },
    ]);
    expect([...selected]).toEqual(["inbound_sms:INSERT"]);
  });

  test("selectedSetToEventConfig bridges legacy WebhookEditor state", () => {
    const selected = new Set(["inbound_call:INSERT", "inbound_call:UPDATE"]);
    const config = selectedSetToEventConfig(selected);
    expect(config.inbound_call).toEqual({ insert: true, update: true });
    expect(config.voicemail).toEqual({ insert: false, update: false });
    expect(eventConfigToSelectedSet(config)).toEqual(selected);
  });

  test("catalog lists nine selectable events", () => {
    expect(WEBHOOK_EVENT_OPTIONS).toHaveLength(9);
  });
});
