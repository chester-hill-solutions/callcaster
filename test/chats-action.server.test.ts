import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  sendMessage: vi.fn(),
  linkContactToConversation: vi.fn(),
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

describe("app/routes/workspaces+/$id/chats.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.sendMessage.mockReset();
    mocks.linkContactToConversation.mockReset();
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
});
