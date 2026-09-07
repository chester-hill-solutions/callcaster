import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDualAuth: vi.fn(),
  getDualAuthUser: vi.fn(),
  getSession: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  createContact: vi.fn(),
  bulkCreateContacts: vi.fn(),
  updateContact: vi.fn(),
  findAudienceWorkspaceById: vi.fn(),
  searchContactsLoader: vi.fn(),
}));

vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthUser: (...args: unknown[]) => mocks.getDualAuthUser(...args),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/database/contact.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/contact.server")>()),
  createContact: (...args: unknown[]) => mocks.createContact(...args),
  bulkCreateContacts: (...args: unknown[]) => mocks.bulkCreateContacts(...args),
  updateContact: (...args: unknown[]) => mocks.updateContact(...args),
}));
vi.mock("@/lib/audience-upload-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audience-upload-db.server")>()),
  findAudienceWorkspaceById: (...args: unknown[]) =>
    mocks.findAudienceWorkspaceById(...args),
}));
vi.mock("../app/routes/api+/contacts.loader.server", () => ({
  searchContactsLoader: (...args: unknown[]) => mocks.searchContactsLoader(...args),
}));

import { asRouteResponse } from "./helpers/route-result";

function postJson(body: Record<string, unknown>) {
  return new Request("http://x/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("api+/contacts.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.requireDualAuth.mockResolvedValue({ kind: "session", user: { id: "u1" } });
    mocks.getDualAuthUser.mockReturnValue({ id: "u1" });
    mocks.getSession.mockResolvedValue({ headers: new Headers() });
    mocks.requireWorkspaceAccess.mockResolvedValue({ role: "member" });
    mocks.createContact.mockResolvedValue({ id: 1 });
    mocks.bulkCreateContacts.mockResolvedValue({ inserted: 0 });
  });

  test("creates the contact in the authorized workspace even when the body names another", async () => {
    const { action } = await import("../app/routes/api+/contacts.action.server");

    const res = await asRouteResponse(
      action({
        request: postJson({
          workspace_id: "ws_authorized",
          workspace: "ws_victim",
          firstname: "Pat",
          phone: "+15555550100",
        }),
        params: {},
        context: {},
      } as never),
    );

    expect(res.status).toBe(200);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws_authorized" }),
    );
    expect(mocks.createContact).toHaveBeenCalledOnce();
    const [payload] = mocks.createContact.mock.calls[0] as [Record<string, unknown>];
    expect(payload.workspace).toBe("ws_authorized");
    expect(payload.firstname).toBe("Pat");
  });

  test("bulk create is bound to the authorized workspace", async () => {
    const { action } = await import("../app/routes/api+/contacts.action.server");

    await asRouteResponse(
      action({
        request: postJson({
          workspace_id: "ws_authorized",
          contacts: [{ firstname: "A", workspace: "ws_victim" }],
        }),
        params: {},
        context: {},
      } as never),
    );

    expect(mocks.bulkCreateContacts).toHaveBeenCalledWith(
      [{ firstname: "A", workspace: "ws_victim" }],
      "ws_authorized",
      undefined,
      "u1",
    );
  });
});
