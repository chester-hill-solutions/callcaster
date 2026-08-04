import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyApiKeyOrSession: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  blockUnenrolledPrivilegedSessionUser: vi.fn(),
  next: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {},
  dbDirect: {},
  directPool: { listen: vi.fn() },
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: unknown[]) =>
    mocks.verifyApiKeyOrSession(...args),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));

vi.mock("@/lib/two-factor.server", () => ({
  blockUnenrolledPrivilegedSessionUser: (...args: unknown[]) =>
    mocks.blockUnenrolledPrivilegedSessionUser(...args),
}));

import { dataPlaneMiddleware } from "@/lib/data-plane-middleware.server";
import { AppError, ErrorCode } from "@/lib/errors.server";

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";

async function runWorkspaceBMiddleware() {
  return dataPlaneMiddleware(
    {
      request: new Request(
        `http://localhost/api/workspaces/${WORKSPACE_B}/campaigns`,
      ),
      params: { workspaceId: WORKSPACE_B },
      context: new RouterContextProvider(),
    },
    mocks.next,
  );
}

describe("WS-H data-plane cross-tenant auth resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockUnenrolledPrivilegedSessionUser.mockResolvedValue(null);
    mocks.next.mockResolvedValue(new Response("unexpected route execution"));
  });

  test("workspace A API key receives 404 for workspace B", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "api_key",
      workspaceId: WORKSPACE_A,
      keyId: "key-a",
      scopes: ["campaigns.read"],
    });

    const response = await runWorkspaceBMiddleware();

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
    await expect((response as Response).json()).resolves.toEqual({
      error: "Workspace not found",
    });
    expect(mocks.next).not.toHaveBeenCalled();
  });

  test("workspace A session receives 404 for workspace B", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "session",
      user: { id: "user-a" },
    });
    mocks.requireWorkspaceAccess.mockRejectedValue(
      new AppError("Workspace not found", 404, ErrorCode.NOT_FOUND),
    );

    const response = await runWorkspaceBMiddleware();

    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({
      user: { id: "user-a" },
      workspaceId: WORKSPACE_B,
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
    await expect((response as Response).json()).resolves.toEqual({
      error: "Workspace not found",
    });
    expect(mocks.next).not.toHaveBeenCalled();
  });
});
