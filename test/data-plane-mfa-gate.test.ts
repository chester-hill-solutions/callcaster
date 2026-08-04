import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveDataPlaneAuth: vi.fn(),
  blockUnenrolledPrivilegedSessionUser: vi.fn(),
  next: vi.fn(async () => new Response("ok")),
}));

vi.mock("@/lib/platform-data.server", () => ({
  resolveDataPlaneAuth: (...args: unknown[]) => mocks.resolveDataPlaneAuth(...args),
}));

vi.mock("@/lib/two-factor.server", () => ({
  blockUnenrolledPrivilegedSessionUser: (...args: unknown[]) =>
    mocks.blockUnenrolledPrivilegedSessionUser(...args),
}));

describe("dataPlaneMiddleware MFA gate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.resolveDataPlaneAuth.mockReset();
    mocks.blockUnenrolledPrivilegedSessionUser.mockReset();
    mocks.next.mockReset();
    mocks.next.mockResolvedValue(new Response("ok"));
    mocks.resolveDataPlaneAuth.mockResolvedValue({ userId: "u1" });
    mocks.blockUnenrolledPrivilegedSessionUser.mockResolvedValue(null);
  });

  test("returns MFA block response before reaching the route", async () => {
    mocks.blockUnenrolledPrivilegedSessionUser.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "enroll", code: "mfa_enrollment_required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { dataPlaneMiddleware } = await import(
      "../app/lib/data-plane-middleware.server"
    );
    const context = new Map<string, unknown>();
    const contextApi = {
      set: (key: unknown, value: unknown) => context.set(String(key), value),
      get: (key: unknown) => context.get(String(key)),
    };

    const result = await dataPlaneMiddleware(
      {
        request: new Request("http://x/api/workspaces/w1/campaigns"),
        params: { workspaceId: "w1" },
        context: contextApi,
      } as never,
      mocks.next,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(mocks.next).not.toHaveBeenCalled();
  });
});
