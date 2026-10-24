import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ archived: false }));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: async () => ({ user: { id: "u1" }, headers: new Headers() }),
}));

vi.mock("@/lib/two-factor.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor.server")>()),
  requireTwoFactorEnrollmentForPrivilegedUser: async () => undefined,
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: async () => ({ role: "owner" }),
}));

vi.mock("@/lib/workspace-archive.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-archive.server")>()),
  isWorkspaceArchived: async () => state.archived,
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({}),
}));

async function run() {
  const { workspaceMiddleware } =
    await import("@/lib/workspace-middleware.server");
  const next = vi.fn(async () => new Response("ok"));
  const context = { set: vi.fn() };
  const args = {
    request: new Request("http://localhost/workspaces/w1"),
    params: { id: "w1" },
    context,
  };
  return {
    next,
    context,
    result: workspaceMiddleware(args as never, next as never),
  };
}

describe("workspace layout gate for archived workspaces (#2732)", () => {
  beforeEach(() => {
    state.archived = false;
  });

  test("a member of a live workspace reaches the route", async () => {
    const { next, result } = await run();

    await result;
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("an archived workspace redirects to the picker instead of rendering", async () => {
    state.archived = true;
    const { next, result } = await run();

    // A redirect, not a 403, so the archived state is not inferable from the
    // response the member gets.
    await expect(result).rejects.toMatchObject({ status: 302 });
    expect(next).not.toHaveBeenCalled();
  });
});
