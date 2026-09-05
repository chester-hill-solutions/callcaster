import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistMessageRecord: vi.fn(),
  resolveMessageByClientRef: vi.fn(async (_ws: string, _ref: string, u: { sid: string }) => ({ id: 1, ...u })),
  deleteMessageByClientRef: vi.fn(async () => undefined),
  create: vi.fn(),
}));

vi.mock("@/lib/message-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/message-db.server")>()),
  resolveMessageByClientRef: (...args: unknown[]) => mocks.resolveMessageByClientRef(...args),
  deleteMessageByClientRef: (...args: unknown[]) => mocks.deleteMessageByClientRef(...args),
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({
    message: {
      insert: (...args: unknown[]) => mocks.persistMessageRecord(...args),
    },
  })),
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitChatMessageEvent: vi.fn(async () => undefined),
}));

import { sendSmsAndPersist } from "../app/lib/sms-send.server";

const twilio = { messages: { create: (...args: unknown[]) => mocks.create(...args) } };

describe("sendSmsAndPersist intent row (#1586)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistMessageRecord.mockImplementation(async (row: Record<string, unknown>) => [row]);
    mocks.create.mockResolvedValue({ sid: "SM_chat", status: "queued", to: "+15555550100", body: "hi", numSegments: "1" });
  });

  test("inserts a pending intent before Twilio and resolves it with the real SID", async () => {
    const out = await sendSmsAndPersist({
      twilio,
      createParams: { body: "hi", to: "+15555550100", messagingServiceSid: "MG1" },
      retryOptions: { workspaceId: "ws_1", operation: "messages.create.chat" },
      persistExtras: { workspace: "ws_1", contact_id: 4 },
    });

    expect(out.result.error).toBeNull();
    const intent = mocks.persistMessageRecord.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(String(intent.sid)).toMatch(/^pending:/);
    expect(intent).toMatchObject({ status: "queued", to: "+15555550100", body: "hi", workspace: "ws_1", contact_id: 4 });
    // Messaging Service send: no fixed from on the intent.
    expect(intent.from).toBeNull();
    expect(mocks.persistMessageRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.resolveMessageByClientRef).toHaveBeenCalledWith(
      "ws_1",
      intent.client_ref,
      expect.objectContaining({ sid: "SM_chat" }),
    );
  });

  test("deletes the intent and rethrows when Twilio refuses", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("Invalid To"), { status: 400 }));

    await expect(
      sendSmsAndPersist({
        twilio,
        createParams: { body: "hi", to: "+15555550100", from: "+15550000001" },
        retryOptions: { workspaceId: "ws_1", operation: "messages.create.chat" },
        persistExtras: { workspace: "ws_1" },
      }),
    ).rejects.toThrow("Invalid To");

    const intent = mocks.persistMessageRecord.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(mocks.deleteMessageByClientRef).toHaveBeenCalledWith("ws_1", intent.client_ref);
    expect(mocks.resolveMessageByClientRef).not.toHaveBeenCalled();
  });

  test("a failed resolve is reported in result.error, not thrown", async () => {
    mocks.resolveMessageByClientRef.mockRejectedValueOnce(new Error("connection reset"));

    const out = await sendSmsAndPersist({
      twilio,
      createParams: { body: "hi", to: "+15555550100", from: "+15550000001" },
      retryOptions: { workspaceId: "ws_1", operation: "messages.create.chat" },
      persistExtras: { workspace: "ws_1" },
    });

    expect(out.message.sid).toBe("SM_chat");
    expect(out.result.error?.message).toBe("connection reset");
  });
});
