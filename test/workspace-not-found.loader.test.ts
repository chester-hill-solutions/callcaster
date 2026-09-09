import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  workspaceLoaderAuth: vi.fn(),
}));

vi.mock("@/lib/workspace-route.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-route.server")>();
  return {
    ...actual,
    workspaceLoaderAuth: (...args: unknown[]) => mocks.workspaceLoaderAuth(...args),
  };
});

async function runLoader() {
  const mod = await import("../app/routes/workspaces+/$id/$");
  return mod.loader({
    request: new Request("http://localhost/workspaces/ws-1/blah"),
    params: { id: "ws-1", "*": "blah" },
    context: new Map(),
  } as never);
}

// #1397: an unknown path under a workspace used to fall through to the root
// ErrorBoundary and render a bare light-mode document. The catch-all route
// throws a real 404 Response so the workspace layout's own boundary renders
// "Page not found" inside the app chrome.
describe("app/routes/workspaces+/$id/$.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.workspaceLoaderAuth.mockReset();
  });

  test("throws a 404 Response for a signed-in member", async () => {
    const headers = new Headers({ "set-cookie": "session=abc" });
    mocks.workspaceLoaderAuth.mockResolvedValue({
      ok: true,
      ctx: { headers, workspaceId: "ws-1", userRole: "owner", user: { id: "u1" } },
    });

    const thrown = await runLoader().then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect((thrown as Response).headers.get("set-cookie")).toBe("session=abc");
  });

  test("returns the auth response when the workspace guard fails", async () => {
    const denied = new Response(null, { status: 302, headers: { location: "/signin" } });
    mocks.workspaceLoaderAuth.mockResolvedValue({ ok: false, response: denied });

    await expect(runLoader()).resolves.toBe(denied);
  });
});
