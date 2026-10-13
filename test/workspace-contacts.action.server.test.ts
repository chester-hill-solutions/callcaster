import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  deleteContactApi: vi.fn(),
}));

vi.mock("@/lib/platform-data.server", () => ({
  deleteContactApi: (...args: unknown[]) => mocks.deleteContactApi(...args),
}));

describe("workspace contacts delete action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.deleteContactApi.mockReset();
  });

  test("deletes a member-visible workspace contact", async () => {
    mocks.deleteContactApi.mockResolvedValueOnce({ ok: true, contact_id: 4 });
    const formData = new FormData();
    formData.set("intent", "delete_contact");
    formData.set("contact_id", "4");
    const { action } = await import("../app/routes/workspaces+/$id/contacts.action.server");

    const response = await asRouteResponse(
      action(
        await withWorkspaceRouteArgs({
          request: new Request("http://localhost/workspaces/ws-1/contacts", {
            method: "POST",
            body: formData,
          }),
          params: { id: "ws-1" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, contact_id: 4 });
    expect(mocks.deleteContactApi).toHaveBeenCalledWith("4", "ws-1");
  });

  test("rejects a caller before deleting", async () => {
    const formData = new FormData();
    formData.set("intent", "delete_contact");
    formData.set("contact_id", "4");
    const { action } = await import("../app/routes/workspaces+/$id/contacts.action.server");

    const response = await asRouteResponse(
      action(
        await withWorkspaceRouteArgs(
          {
            request: new Request("http://localhost/workspaces/ws-1/contacts", {
              method: "POST",
              body: formData,
            }),
            params: { id: "ws-1" },
          },
          { userRole: "caller" },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.deleteContactApi).not.toHaveBeenCalled();
  });
});
