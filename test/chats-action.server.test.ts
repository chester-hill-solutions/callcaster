import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  sendMessage: vi.fn(),
  linkContactToConversation: vi.fn(),
  getEffectivePortalConfig: vi.fn(),
  getWorkspaceCreditsBalance: vi.fn(async () => 100),
  findMatchingContactIds: vi.fn(async () => [] as number[]),
}));

const tenantDbMocks = vi.hoisted(() => ({
  contact: {
    findFirst: vi.fn(async () => null),
  },
  workspace_number: {
    findMany: vi.fn(async () => [{ phone_number: "+15550000000" }]),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/chat-sms.server", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
}));

vi.mock("@/lib/database/chat-contact-link.server", () => ({
  linkContactToConversation: (...args: unknown[]) =>
    mocks.linkContactToConversation(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getEffectiveWorkspaceTwilioPortalConfigForWorkspace: (...args: unknown[]) =>
    mocks.getEffectivePortalConfig(...args),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tenantDbMocks),
}));

vi.mock("@/lib/twilio-lookup.server", () => ({
  getOrLookupLineType: vi.fn(async () => null),
  isSmsIncapableLineType: () => false,
}));

vi.mock("@/lib/inbound-sms-context.server", () => ({
  findMatchingContactIds: (...args: unknown[]) => mocks.findMatchingContactIds(...args),
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: unknown[]) =>
    mocks.getWorkspaceCreditsBalance(...args),
}));

describe("app/routes/workspaces+/$id/chats.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.sendMessage.mockReset();
    mocks.linkContactToConversation.mockReset();
    mocks.getWorkspaceCreditsBalance.mockReset();
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(100);
    mocks.getEffectivePortalConfig.mockReset();
    mocks.getEffectivePortalConfig.mockResolvedValue({
      sendMode: "from_number",
      messagingServiceSid: null,
    });
    tenantDbMocks.contact.findFirst.mockReset();
    tenantDbMocks.contact.findFirst.mockResolvedValue(null);
    tenantDbMocks.workspace_number.findMany.mockReset();
    tenantDbMocks.workspace_number.findMany.mockResolvedValue([
      { phone_number: "+15550000000" },
    ]);
    mocks.verifyAuth.mockResolvedValue({
      headers: new Headers(),
      user: { id: "u1" },
    });
  });

  test("link_contact intent links the contact and returns linkedCount without calling sendMessage", async () => {
    mocks.linkContactToConversation.mockResolvedValueOnce({ linkedCount: 3 });

    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );

    const formData = new FormData();
    formData.set("intent", "link_contact");
    formData.set("contact_id", "42");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ linkedCount: 3, contactId: 42 });
    expect(mocks.linkContactToConversation).toHaveBeenCalledWith({
      workspaceId: "w1",
      contactId: 42,
      contactPhone: "+15555550100",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  test("link_contact intent rejects a missing/invalid contact_id", async () => {
    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );

    const formData = new FormData();
    formData.set("intent", "link_contact");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(400);
    expect(mocks.linkContactToConversation).not.toHaveBeenCalled();
  });

  test("falls through to sendMessage for a normal send (no intent)", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" } });

    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );

    const formData = new FormData();
    formData.set("body", "hi");
    formData.set("from", "+15550000000");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15555550100", body: "hi" }),
    );
    expect(mocks.linkContactToConversation).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      billing: { balanceBefore: 100, estimatedCredits: 2, nextSendBlocked: false },
    });
  });

  test("a send that uses up the balance succeeds and carries a billing notice", async () => {
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(2);
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" } });

    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );

    const formData = new FormData();
    formData.set("body", "hi");
    formData.set("from", "+15550000000");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.billing).toEqual({
      balanceBefore: 2,
      estimatedCredits: 2,
      nextSendBlocked: true,
    });
  });

  test("a depleted balance blocks before sending", async () => {
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );

    const formData = new FormData();
    formData.set("body", "hi");
    formData.set("from", "+15550000000");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(402);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: "Insufficient credits",
      creditsError: true,
    });
  });

  test("does not require from when the server resolves Messaging Service mode", async () => {
    mocks.getEffectivePortalConfig.mockResolvedValueOnce({
      sendMode: "messaging_service",
      messagingServiceSid: "MG123",
    });
    mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" } });

    const { action } = await import(
      "../app/routes/workspaces+/$id/chats.action.server"
    );
    const formData = new FormData();
    formData.set("body", "hi");
    formData.set("mode", "from_number");

    const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })),
    );

    expect(res.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: "", messagingServiceSid: "MG123" }),
    );
  });

  describe("template tags", () => {
    beforeEach(() => {
      // The opt-out and line-type guards look contacts up on the same mocks
      // before the renderer runs, so use persistent values, not one-shots.
      mocks.findMatchingContactIds.mockReset().mockResolvedValue([]);
      tenantDbMocks.contact.findFirst.mockReset().mockResolvedValue(null as never);
    });

    async function send(body: string, extra: Record<string, string> = {}) {
      mocks.sendMessage.mockResolvedValueOnce({ message: { sid: "SM1" } });
      const { action } = await import(
        "../app/routes/workspaces+/$id/chats.action.server"
      );
      const formData = new FormData();
      formData.set("body", body);
      formData.set("from", "+15550000000");
      for (const [k, v] of Object.entries(extra)) formData.set(k, v);
      const res = await asRouteResponse(action(await withWorkspaceRouteArgs({
        request: new Request("http://x/workspaces/w1/chats/+15555550100", {
          method: "POST",
          body: formData,
        }),
        params: { id: "w1", contact_number: "+15555550100" },
      })));
      expect(res.status).toBe(200);
      return mocks.sendMessage.mock.calls.at(-1)?.[0] as { body: string };
    }

    test("renders tags for the linked contact", async () => {
      tenantDbMocks.contact.findFirst.mockResolvedValue({
        id: 7,
        firstname: "Ada",
        city: "London",
      } as never);
      const sent = await send('Hi {{firstname}} from {{city|"nowhere"}}', { contact_id: "7" });
      expect(sent.body).toBe("Hi Ada from London");
    });

    test("renders tags against the single contact matching the phone number", async () => {
      mocks.findMatchingContactIds.mockResolvedValue([9]);
      tenantDbMocks.contact.findFirst.mockResolvedValue({
        id: 9,
        firstname: "",
        surname: "Lovelace",
      } as never);
      const sent = await send('Hi {{firstname|"there"}} {{surname}}');
      expect(sent.body).toBe("Hi there Lovelace");
    });

    test("sends the text as typed when no contact matches or the match is ambiguous", async () => {
      mocks.findMatchingContactIds.mockResolvedValue([1, 2]);
      const sent = await send("Hi {{firstname}}");
      expect(sent.body).toBe("Hi {{firstname}}");
    });

    test("skips the contact lookup entirely when the body has no tags", async () => {
      const sent = await send("plain text");
      expect(sent.body).toBe("plain text");
      // The guards find no match, so the only remaining reason to load a
      // contact row would be rendering, which must not happen here.
      expect(tenantDbMocks.contact.findFirst).not.toHaveBeenCalled();
    });
  });
});
