import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.server", () => ({
  env: {
    SUPABASE_URL: () => "http://supabase.test",
    SUPABASE_ANON_KEY: () => "anon-key",
  },
}));
vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("app/routes/api.auth.callback.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("redirects to next on successful OTP verification and appends Set-Cookie", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const parseMock = vi.fn(() => ({ sb: "cookie" }));
    const serializeMock = vi.fn((k: string, v: string) => `${k}=${v}`);

    const createServerClient = vi.fn((_url: string, _anon: string, opts: any) => {
      // Exercise cookie helpers so the Set-Cookie append lines are covered.
      expect(opts.cookies.get("sb")).toBe("cookie");
      opts.cookies.set("a", "1", {});
      opts.cookies.remove("b", {});
      return { auth: { verifyOtp } };
    });

    vi.doMock("@supabase/ssr", () => ({
      createServerClient,
      parse: parseMock,
      serialize: serializeMock,
    }));

    const mod = await import("../app/routes/api.auth.callback");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=%2Fok",
        { headers: { Cookie: "sb=1" } },
      ),
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/ok");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("a=1");
    expect(setCookie).toContain("b=");
    expect(parseMock).toHaveBeenCalled();
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "th" });
  }, 30000);

  test("redirects to auth-code-error on verifyOtp error and logs", async () => {
    const verifyOtp = vi.fn(async () => ({ error: new Error("bad") }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn((_url: string, _anon: string, _opts: any) => ({
        auth: { verifyOtp },
      })),
      parse: vi.fn(() => ({})),
      serialize: vi.fn((k: string, v: string) => `${k}=${v}`),
    }));

    const { logger } = await import("@/lib/logger.server");
    const mod = await import("../app/routes/api.auth.callback");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=%2Fok",
      ),
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/auth-code-error");
    expect(logger.error).toHaveBeenCalled();
  });

  test("falls back to root for absolute next URLs", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn((_url: string, _anon: string, _opts: any) => ({
        auth: { verifyOtp },
      })),
      parse: vi.fn(() => ({})),
      serialize: vi.fn((k: string, v: string) => `${k}=${v}`),
    }));

    const mod = await import("../app/routes/api.auth.callback");
    const res = await mod.loader({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=https%3A%2F%2Fevil.example",
      ),
    } as any);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  test("redirects to auth-code-error when token_hash/type missing", async () => {
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn(() => ({ auth: { verifyOtp: vi.fn() } })),
      parse: vi.fn(() => ({})),
      serialize: vi.fn((k: string, v: string) => `${k}=${v}`),
    }));

    const mod = await import("../app/routes/api.auth.callback");
    const res1 = await mod.loader({
      request: new Request("http://localhost/api/auth/callback?type=signup"),
    } as any);
    expect(res1.headers.get("Location")).toBe("/auth/auth-code-error");

    const res2 = await mod.loader({
      request: new Request("http://localhost/api/auth/callback?token_hash=th"),
    } as any);
    expect(res2.headers.get("Location")).toBe("/auth/auth-code-error");
  });
});

