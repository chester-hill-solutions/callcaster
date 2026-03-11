import { describe, expect, test, vi, beforeEach } from "vitest";

const ssrMocks = vi.hoisted(() => {
  return {
    parse: vi.fn(),
    serialize: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    createServerClient: vi.fn(),
  };
});

vi.mock("@supabase/ssr", () => {
  return {
    parse: ssrMocks.parse,
    serialize: ssrMocks.serialize,
    createServerClient: (...args: any[]) => ssrMocks.createServerClient(...args),
  };
});

// Avoid env validation noise and keep the test deterministic.
vi.mock("../app/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

describe("supabase.server", () => {
  beforeEach(() => {
    ssrMocks.parse.mockReset();
    ssrMocks.serialize.mockReset();
    ssrMocks.getSession.mockReset();
    ssrMocks.getUser.mockReset();
    ssrMocks.signOut.mockReset();
    ssrMocks.createServerClient.mockReset();
    vi.resetModules();

    ssrMocks.serialize.mockImplementation((k: string, v: string) => `${k}=${v}`);
    ssrMocks.parse.mockReturnValue({ a: "1" });
    ssrMocks.createServerClient.mockImplementation((_url: string, _key: string, opts: any) => {
      // Make cookies handlers observable through mock calls.
      (ssrMocks.createServerClient as any).lastCookies = opts.cookies;
      return {
        auth: {
          getSession: ssrMocks.getSession,
          getUser: ssrMocks.getUser,
          signOut: ssrMocks.signOut,
        },
      };
    });
  });

  test("createSupabaseServerClient parses cookies and appends Set-Cookie on set/remove", async () => {
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/x", { headers: { Cookie: "a=1" } });

    const { supabaseClient, headers } = mod.createSupabaseServerClient(req);
    expect(supabaseClient).toBeTruthy();
    expect(ssrMocks.parse).toHaveBeenCalledWith("a=1");

    const cookies = (ssrMocks.createServerClient as any).lastCookies;
    expect(cookies.get("a")).toBe("1");
    cookies.set("sb", "v", { path: "/" });
    cookies.remove("sb", { path: "/" });

    const setCookies = headers.get("Set-Cookie") ?? "";
    expect(setCookies).toContain("sb=v");
    expect(setCookies).toContain("sb=");
  });

  test("getSupabaseServerClientWithSession redirects when session missing", async () => {
    ssrMocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/workspaces");
    try {
      await mod.getSupabaseServerClientWithSession(req);
      throw new Error("expected redirect");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).headers.get("Location")).toBe("/signin?next=/workspaces");
    }
  });

  test("getSupabaseServerClientWithSession redirects when user missing or error", async () => {
    ssrMocks.getSession.mockResolvedValueOnce({ data: { session: { id: "s" } } });
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/workspaces");
    await expect(mod.getSupabaseServerClientWithSession(req)).rejects.toBeInstanceOf(Response);

    vi.resetModules();
    ssrMocks.getSession.mockResolvedValueOnce({ data: { session: { id: "s" } } });
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u" } }, error: new Error("bad") });
    const mod2 = await import("../app/lib/supabase.server");
    await expect(mod2.getSupabaseServerClientWithSession(req)).rejects.toBeInstanceOf(Response);
  });

  test("getSupabaseServerClientWithSession returns session + user when present", async () => {
    ssrMocks.getSession.mockResolvedValueOnce({ data: { session: { id: "s" } } });
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u" } }, error: null });
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/workspaces");
    const res = await mod.getSupabaseServerClientWithSession(req);
    expect(res.serverSession).toMatchObject({ id: "s" });
    expect(res.user).toMatchObject({ id: "u" });
  });

  test("verifyAuth redirects when user missing, otherwise returns user", async () => {
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/x");
    await expect(mod.verifyAuth(req, "/next")).rejects.toBeInstanceOf(Response);

    vi.resetModules();
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u" } }, error: new Error("bad") });
    const modErr = await import("../app/lib/supabase.server");
    await expect(modErr.verifyAuth(req, "/next")).rejects.toBeInstanceOf(Response);

    vi.resetModules();
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u" } }, error: null });
    const mod2 = await import("../app/lib/supabase.server");
    const res = await mod2.verifyAuth(req, "/next");
    expect(res.user).toMatchObject({ id: "u" });
  });

  test("verifyAuth uses default nextUrl when not provided", async () => {
    ssrMocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/x");
    try {
      await mod.verifyAuth(req);
      throw new Error("expected redirect");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).headers.get("Location")).toBe("/signin?next=/signin");
    }
  });

  test("signOut calls supabase.auth.signOut", async () => {
    ssrMocks.signOut.mockResolvedValueOnce({});
    const mod = await import("../app/lib/supabase.server");
    const req = new Request("http://localhost/x");
    await mod.signOut(req);
    expect(ssrMocks.signOut).toHaveBeenCalledTimes(1);
  });
});

