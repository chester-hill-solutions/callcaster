import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  sendMessage: vi.fn(),
  linkContactToConversation: vi.fn(),
  getEffectivePortalConfig: vi.fn(),
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
  findMatchingContactIds: vi.fn(async () => [] as number[]),
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => 100),
}));

describe("app/routes/workspaces+/$id/chats.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.sendMessage.mockReset();
    mocks.linkContactToConversation.mockReset();
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
});
