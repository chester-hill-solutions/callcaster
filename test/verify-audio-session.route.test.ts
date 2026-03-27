import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const pause = vi.fn();
  const gather = vi.fn();
  const toString = vi.fn(() => "<Response />");
  const VoiceResponse = vi.fn(function (this: any) {
    return { say, pause, gather, toString };
  });

  return {
    verifyAuth: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    logger: { error: vi.fn() },
    env: { BASE_URL: vi.fn(() => "http://base") },
    VoiceResponse,
    say,
    pause,
    gather,
    toString,
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("twilio", () => ({
  default: { twiml: { VoiceResponse: mocks.VoiceResponse } },
}));

function makeSupabase(opts: {
  insertResult?: { data: any; error: any };
  deleteSpy?: any;
}) {
  const delEq = opts.deleteSpy ?? vi.fn(async () => ({}));
  return {
    from: vi.fn((table: string) => {
      if (table === "phone_verification") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => opts.insertResult ?? { data: { id: 1, pin: "100000" }, error: null }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: delEq,
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("app/routes/api.verify-audio-session.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.logger.error.mockReset();
    mocks.env.BASE_URL.mockClear();
    mocks.VoiceResponse.mockClear();
    mocks.say.mockReset();
    mocks.pause.mockReset();
    mocks.gather.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
  });

  test("loader returns 401 when user missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: null,
    });
    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("loader throws for invalid phone normalization length", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({}),
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: vi.fn() } });

    const mod = await import("../app/routing/api/api.verify-audio-session");
    await expect(
      mod.loader({
        request: new Request(
          "http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=%2B12&fromNumber=%2B12"
        ),
      } as any)
    ).rejects.toThrow("Invalid phone number length");
  });

  test("loader returns 500 when verification insert errors", async () => {
    const supabase = makeSupabase({
      insertResult: { data: null, error: { message: "ins" } },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: vi.fn() } });
    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "ins" });
  });

  test("loader success calls twilio and returns verification info with headers", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    const supabase = makeSupabase({
      insertResult: { data: { id: 9, pin: "123456" }, error: null },
    });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, headers, user: { id: "u1" } });
    const create = vi.fn(async () => ({ sid: "CA1" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create } });

    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({
      success: true,
      verificationId: 9,
      callSid: "CA1",
      pin: "123456",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://base/api/verify-audio-pin/123456",
        method: "GET",
      })
    );
  });

  test("loader normalizes numbers (plus not at start, adds +1) and succeeds", async () => {
    const supabase = makeSupabase({
      insertResult: { data: { id: 3, pin: "222222" }, error: null },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const create = vi.fn(async () => ({ sid: "CA2" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create } });

    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=1%2B5551234567&fromNumber=5551234567"
      ),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ callSid: "CA2", pin: "222222" });
  });

  test("loader keeps leading '+' when already present", async () => {
    const supabase = makeSupabase({
      insertResult: { data: { id: 4, pin: "333333" }, error: null },
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: vi.fn(async () => ({ sid: "CA3" })) },
    });

    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request(
        "http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=%2B15551234567&fromNumber=%2B15551234567"
      ),
    } as any);
    expect(res.status).toBe(200);
  });

  test("loader twilio create failure deletes verification record and returns 500", async () => {
    const delEq = vi.fn(async () => ({}));
    const supabase = makeSupabase({
      insertResult: { data: { id: 2, pin: "999999" }, error: null },
      deleteSpy: delEq,
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: supabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: {
        create: vi.fn(async () => {
          throw new Error("twilio");
        }),
      },
    });

    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "twilio" });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error initiating verification call:",
      expect.anything()
    );
    expect(delEq).toHaveBeenCalledWith("id", 2);
  });

  test("action returns TwiML xml", async () => {
    const mod = await import("../app/routing/api/api.verify-audio-session");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toBe("<Response />");
    expect(mocks.gather).toHaveBeenCalledWith(
      expect.objectContaining({
        numDigits: 6,
        action: "http://base/api/verify-pin-input",
        method: "POST",
        timeout: 30,
      })
    );
  });
});

