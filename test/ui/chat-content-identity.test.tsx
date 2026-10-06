import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useChatRealTime } from "@/hooks/realtime/useChatRealtime";
import type { Message } from "@/lib/types";
import { createWorkspaceEventSourceMock } from "./hooks-test-helpers";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});

function message(
  overrides: Partial<NonNullable<Message>> = {},
): NonNullable<Message> {
  return {
    account_sid: null,
    api_version: null,
    body: "Hello",
    campaign_id: null,
    contact_id: null,
    date_created: new Date("2026-10-06T12:00:00Z"),
    date_sent: null,
    date_updated: null,
    direction: "outbound-reply",
    error_code: null,
    error_message: null,
    from: "+18005550199",
    to: "+15551234567",
    inbound_media: [],
    outbound_media: [],
    messaging_service_sid: null,
    num_media: "0",
    num_segments: "1",
    scheduled_at: null,
    outreach_attempt_id: null,
    price: null,
    price_unit: null,
    sid: "SM1",
    status: "sent",
    subresource_uris: null,
    uri: null,
    workspace: "ws",
    ...overrides,
  };
}

beforeEach(() => {
  createWorkspaceEventSourceMock();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function boundedThread(initial: NonNullable<Message>, clone: boolean) {
  let renders = 0;
  const hook = renderHook(
    ({ row, workspace, contact }) => {
      renders++;
      if (renders > 12) throw new Error("Bounded render guard exceeded");
      const copy = clone
        ? {
            ...row,
            date_created: row.date_created ? new Date(row.date_created) : null,
            inbound_media: row.inbound_media ? [...row.inbound_media] : null,
            outbound_media: row.outbound_media ? [...row.outbound_media] : null,
            subresource_uris: structuredClone(row.subresource_uris),
          }
        : row;
      return useChatRealTime({
        initial: [copy],
        workspace,
        contact_number: contact,
      });
    },
    {
      initialProps: { row: initial, workspace: "ws", contact: "+15551234567" },
      wrapper: StrictMode,
    },
  );
  return { ...hook, renders: () => renders };
}

test("fresh outer arrays with retained row identity converge", () => {
  const hook = boundedThread(message(), false);
  expect(hook.result.current.messages.map((row) => row?.sid)).toEqual(["SM1"]);
  expect(hook.renders()).toBeLessThanOrEqual(6);
});

test("equal fresh rows, nested media and dates converge under StrictMode", () => {
  const hook = boundedThread(
    message({
      inbound_media: ["https://media.test/a.mp3"],
      subresource_uris: { media: ["/media/a", { uri: "/media/b" }] },
    }),
    true,
  );
  expect(hook.result.current.messages[0]).toMatchObject({
    sid: "SM1",
    body: "Hello",
  });
  const settled = hook.result.current.messages;
  act(() => {
    hook.rerender({
      row: message({
        inbound_media: ["https://media.test/a.mp3"],
        subresource_uris: { media: ["/media/a", { uri: "/media/b" }] },
      }),
      workspace: "ws",
      contact: "+15551234567",
    });
  });
  expect(hook.result.current.messages).toBe(settled);
  expect(hook.renders()).toBeLessThanOrEqual(8);
});

test.each([
  { name: "body", update: { body: "Changed reply" } },
  { name: "status", update: { status: "delivered" } },
  {
    name: "provider error",
    update: { error_code: "30003", error_message: "Unreachable handset" },
  },
  {
    name: "inbound media",
    update: { inbound_media: ["https://media.test/new.jpg"] },
  },
  {
    name: "outbound media",
    update: { outbound_media: ["https://media.test/reply.jpg"] },
  },
  {
    name: "nested provider metadata",
    update: { subresource_uris: { media: ["/media/new"] } },
  },
  {
    name: "creation date",
    update: { date_created: new Date("2026-10-06T12:01:00Z") },
  },
])("real $name changes apply and then converge", ({ update }) => {
  const hook = boundedThread(message(), true);
  const before = hook.result.current.messages;
  act(() => {
    hook.rerender({
      row: message(update),
      workspace: "ws",
      contact: "+15551234567",
    });
  });
  expect(hook.result.current.messages).not.toBe(before);
  expect(hook.result.current.messages[0]).toMatchObject(update);
  const settled = hook.result.current.messages;
  act(() => {
    hook.rerender({
      row: message(update),
      workspace: "ws",
      contact: "+15551234567",
    });
  });
  expect(hook.result.current.messages).toBe(settled);
  expect(hook.renders()).toBeLessThanOrEqual(12);
});

test.each([
  { name: "workspace", workspace: "ws2", contact: "+15551234567" },
  { name: "contact", workspace: "ws", contact: "+15557654321" },
])("$name changes reset retained history", ({ workspace, contact }) => {
  const hook = boundedThread(message(), true);
  act(() => {
    hook.result.current.setMessages((current) => [
      message({
        sid: "older",
        body: "Old history",
        date_created: new Date("2026-10-06T11:00:00Z"),
      }),
      ...current,
    ]);
  });
  expect(hook.result.current.messages.map((row) => row?.sid)).toEqual([
    "older",
    "SM1",
  ]);
  act(() => {
    hook.rerender({
      row: message({ sid: "SM2", workspace, to: contact }),
      workspace,
      contact,
    });
  });
  expect(hook.result.current.messages.map((row) => row?.sid)).toEqual(["SM2"]);
  expect(hook.renders()).toBeLessThanOrEqual(12);
});
