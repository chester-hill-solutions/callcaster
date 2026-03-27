import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  env: {
    VERIFICATION_PHONE_NUMBER: vi.fn(),
  },
}));

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

function makeSupabase(opts: { insertResult?: { data: unknown; error: unknown } }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "verification_session") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(
                async () =>
                  opts.insertResult ?? {
                    data: {
                      id: "vs-1",
                      user_id: "u1",
                      expected_caller: "+15551234567",
                      status: "pending",
                      expires_at: new Date().toISOString(),
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  }
              ),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("app/routes/api.verify-call-in-session.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReset();
  });

  test("loader returns 401 when user missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: null,
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=+15551234567"
      ),
    } as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("loader returns 503 when VERIFICATION_PHONE_NUMBER not configured", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue(undefined);

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=+15551234567"
      ),
    } as never);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Call-in verification is not configured",
    });
  });

  test("loader returns 400 when phoneNumber missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request("http://x/api/verify-call-in-session"),
    } as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Valid phone number is required",
    });
  });

  test("loader returns 400 when phoneNumber invalid", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=123"
      ),
    } as never);
    expect(res.status).toBe(400);
  });

  test("loader success creates session and returns phone number", async () => {
    const supabase = makeSupabase({
      insertResult: {
        data: {
          id: "vs-abc",
          user_id: "u1",
          expected_caller: "+15551234567",
          status: "pending",
          expires_at: "2025-03-11T12:00:00Z",
          created_at: "2025-03-11T11:50:00Z",
        },
        error: null,
      },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=%2B15551234567"
      ),
    } as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      success: true,
      verificationId: "vs-abc",
      phoneNumber: "+15550001111",
    });
    expect(data.expiresAt).toBeDefined();
  });

  test("loader returns 500 when insert fails", async () => {
    const supabase = makeSupabase({
      insertResult: { data: null, error: { message: "db error" } },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.env.VERIFICATION_PHONE_NUMBER.mockReturnValue("+15550001111");

    const mod = await import("../app/routing/api/api.verify-call-in-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-call-in-session?phoneNumber=%2B15551234567"
      ),
    } as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db error" });
  });
});
