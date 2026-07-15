import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createNewWorkspace: vi.fn(),
  verifyAuth: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: mocks.verifyAuth,
  verifyAuth: mocks.verifyAuth,
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createNewWorkspace: mocks.createNewWorkspace,
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

describe("app/routes/workspaces+/index.action.server.ts", () => {
  test("creates workspace using authenticated user id", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "auth-user-1" },
      headers: new Headers(),
    });
    mocks.createNewWorkspace.mockResolvedValueOnce({
      data: "w-new",
      error: null,
    });

    const form = new FormData();
    form.set("newWorkspaceName", "  My Workspace  ");
    form.set("userId", "attacker-user-2");

    const mod = await import("../app/routes/workspaces+/index.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/workspaces", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces/w-new");
    expect(mocks.createNewWorkspace).toHaveBeenCalledWith({
      workspaceName: "My Workspace",
      user_id: "auth-user-1",
    });
  });

  test("rejects missing workspace name with 400", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "auth-user-1" },
      headers: new Headers(),
    });

    const form = new FormData();
    form.set("userId", "auth-user-1");

    const mod = await import("../app/routes/workspaces+/index.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/workspaces", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Workspace name is required.",
    });
  });

  test("rejects oversized workspace name with 400", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "auth-user-1" },
      headers: new Headers(),
    });

    const form = new FormData();
    form.set("newWorkspaceName", "a".repeat(201));

    const mod = await import("../app/routes/workspaces+/index.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/workspaces", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Workspace name must be 200 characters or fewer.",
    });
  });

  test("returns 500 with safe error when creation fails", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "auth-user-1" },
      headers: new Headers(),
    });
    mocks.createNewWorkspace.mockResolvedValueOnce({
      data: null,
      error: { message: "malformed record literal: \"owner\"" },
    });

    const form = new FormData();
    form.set("newWorkspaceName", "Audit Workspace");

    const mod = await import("../app/routes/workspaces+/index.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: new Request("http://localhost/workspaces", {
          method: "POST",
          headers: { "x-request-id": "req-test-1" },
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create workspace. Please try again.",
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error creating workspace",
      expect.objectContaining({
        requestId: "req-test-1",
        userId: "auth-user-1",
      }),
    );
  });
});
