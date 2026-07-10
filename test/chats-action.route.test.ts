import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    sendMessage: vi.fn(),
    cancelScheduledMessage: vi.fn(),
    linkContactToConversation: vi.fn(),
    getOrLookupLineType: vi.fn(async () => null as string | null),
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  };
});

const tenantDbMocks = vi.hoisted(() => ({
  contact: {
    findFirst: vi.fn(async () => null),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/chat-sms.server", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
  cancelScheduledMessage: (...args: unknown[]) => mocks.cancelScheduledMessage(...args),
}));
vi.mock("@/lib/database/chat-contact-link.server", () => ({
  linkContactToConversation: (...args: unknown[]) =>
    mocks.linkContactToConversation(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tenantDbMocks),
}));
vi.mock("@/lib/twilio-lookup.server", () => ({
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: (lineType: string | null | undefined) =>
    lineType === "landline" || lineType === "fax",
}));

function makeFormRequest(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }
  return new Request("http://x/workspaces/w1/chats/+15551234567", {
    method: "POST",
    body,
  });
}

describe("app/routes/workspaces+/$id/chats.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.verifyAuth.mockResolvedValue({
      user: { id: "u1" },
      headers: new Headers(),
    });
    mocks.sendMessage.mockReset();
    mocks.cancelScheduledMessage.mockReset();
    mocks.linkContactToConversation.mockReset();
    mocks.logger.error.mockReset();
    mocks.getOrLookupLineType.mockReset();
    mocks.getOrLookupLineType.mockResolvedValue(null);
    tenantDbMocks.contact.findFirst.mockReset();
    tenantDbMocks.contact.findFirst.mockResolvedValue(null);
  });

  test("rejects sending to an opted-out contact with a 403 before calling sendMessage", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: true });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          contact_id: "9",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "This contact has opted out of messages.",
      optedOut: true,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("sends normally when contact_id is present but not opted out", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: false });
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          contact_id: "9",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: "9", sendAt: null }),
    );
  });

  test("skips the opt-out lookup when no contact_id is linked", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(tenantDbMocks.contact.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("fails open (still sends) when the opt-out lookup throws", async () => {
    tenantDbMocks.contact.findFirst.mockRejectedValueOnce(new Error("db down"));
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          contact_id: "9",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error checking contact opt-out status:",
      expect.any(Error),
    );
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("rejects sending to a landline contact with a 400 before calling sendMessage", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: false });
    mocks.getOrLookupLineType.mockResolvedValueOnce("landline");
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          contact_id: "9",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "This number is a landline and can't receive SMS.",
      landline: true,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.getOrLookupLineType).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        contactId: 9,
        phone: "+15551234567",
      }),
    );
  });

  test.each(["mobile", "voip", null])(
    "sends normally when the contact's line type is %s (only landline blocks)",
    async (lineType) => {
      tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: false });
      mocks.getOrLookupLineType.mockResolvedValueOnce(lineType);
      mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
      const mod = await import(
        "../app/routes/workspaces+/$id/chats.action.server"
      );
      const res = await asRouteResponse(
        await mod.action({
          request: makeFormRequest({
            body: "hi",
            contact_number: "+15551234567",
            contact_id: "9",
            from: "+15550000000",
          }),
          params: { id: "w1", contact_number: "+15551234567" },
        } as any),
      );
      expect(res.status).toBe(200);
      expect(mocks.sendMessage).toHaveBeenCalled();
    },
  );

  test("skips the landline lookup when no contact_id is linked", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.getOrLookupLineType).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("fails open (still sends) when the landline lookup throws", async () => {
    tenantDbMocks.contact.findFirst.mockResolvedValueOnce({ id: 9, opt_out: false });
    mocks.getOrLookupLineType.mockRejectedValueOnce(new Error("lookup down"));
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          contact_id: "9",
          from: "+15550000000",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalled();
  });

  test("passes send_at through to sendMessage for scheduled sends", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" }, data: [] });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const sendAt = "2026-08-01T12:00:00.000Z";
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          from: "+15550000000",
          send_at: sendAt,
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sendAt }),
    );
  });

  test("returns a 400 with a clear message when sendMessage rejects (e.g. schedule validation)", async () => {
    mocks.sendMessage.mockRejectedValueOnce(
      new Error("Scheduled send time must be at least 15 minutes from now"),
    );
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          body: "hi",
          contact_number: "+15551234567",
          from: "+15550000000",
          send_at: "2026-08-01T12:00:00.000Z",
        }),
        params: { id: "w1", contact_number: "+15551234567" },
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Scheduled send time must be at least 15 minutes from now",
    });
  });

  test("cancel_scheduled_message intent cancels via chat-sms.server and returns the updated message", async () => {
    mocks.cancelScheduledMessage.mockResolvedValueOnce({
      message: { sid: "SM1", status: "canceled" },
    });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          intent: "cancel_scheduled_message",
          sid: "SM1",
        }),
        params: { id: "w1" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.cancelScheduledMessage).toHaveBeenCalledWith({
      sid: "SM1",
      workspace: "w1",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("cancel_scheduled_message requires a sid", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({ intent: "cancel_scheduled_message" }),
        params: { id: "w1" },
      } as any),
    );
    expect(res.status).toBe(400);
    expect(mocks.cancelScheduledMessage).not.toHaveBeenCalled();
  });

  test("cancel_scheduled_message returns 400 with a clear message on failure", async () => {
    mocks.cancelScheduledMessage.mockRejectedValueOnce(
      new Error("Message is no longer cancelable"),
    );
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          intent: "cancel_scheduled_message",
          sid: "SM1",
        }),
        params: { id: "w1" },
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Message is no longer cancelable",
    });
  });

  test("link_contact intent is unaffected by the opt-out gate", async () => {
    mocks.linkContactToConversation.mockResolvedValueOnce({ linkedCount: 1 });
    const mod = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const res = await asRouteResponse(
      await mod.action({
        request: makeFormRequest({
          intent: "link_contact",
          contact_id: "9",
          contact_number: "+15551234567",
        }),
        params: { id: "w1" },
      } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.linkContactToConversation).toHaveBeenCalled();
    expect(tenantDbMocks.contact.findFirst).not.toHaveBeenCalled();
  });
});
