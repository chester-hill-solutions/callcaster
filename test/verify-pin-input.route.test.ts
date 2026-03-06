import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const hangup = vi.fn();
  const toString = vi.fn(() => "<Response />");
  const VoiceResponse = vi.fn(function (this: any) {
    return { say, hangup, toString };
  });
  return {
    createClient: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { debug: vi.fn() },
    VoiceResponse,
    say,
    hangup,
    toString,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("twilio", () => ({
  default: { twiml: { VoiceResponse: mocks.VoiceResponse } },
}));

function makeSupabase(opts: {
  verification?: { data: any; error: any };
  user?: { data: any; error: any };
  updateError?: any;
}) {
  const delEq = vi.fn(async () => ({}));
  const userUpdateEq = vi.fn(async () => ({ error: opts.updateError ?? null }));

  return {
    from: vi.fn((table: string) => {
      if (table === "phone_verification") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  single: vi.fn(async () => opts.verification ?? { data: null, error: { message: "no" } }),
                })),
              })),
            })),
          })),
          delete: vi.fn(() => ({ eq: delEq })),
        };
      }
      if (table === "user") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => opts.user ?? { data: null, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: userUpdateEq,
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    _spies: { delEq, userUpdateEq },
  };
}

describe("app/routes/api.verify-pin-input.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.logger.debug.mockReset();
    mocks.VoiceResponse.mockClear();
    mocks.say.mockReset();
    mocks.hangup.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
  });

  test("missing digits/to returns invalid request TwiML", async () => {
    const supabase = makeSupabase({});
    mocks.createClient.mockReturnValueOnce(supabase);
    const mod = await import("../app/routes/api.verify-pin-input");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: new FormData() }),
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toBe("<Response />");
    expect(mocks.say).toHaveBeenCalledWith(
      "Invalid request. Missing required parameters."
    );
    expect(mocks.hangup).toHaveBeenCalled();
  });

  test("invalid verification returns invalid code TwiML", async () => {
    const supabase = makeSupabase({
      verification: { data: null, error: { message: "no" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    const fd = new FormData();
    fd.set("Digits", "123456");
    fd.set("To", "+15551234567");
    const mod = await import("../app/routes/api.verify-pin-input");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(await res.text()).toBe("<Response />");
    expect(mocks.say).toHaveBeenCalledWith(
      "Invalid or expired verification code. Please try again."
    );
  });

  test("updateError returns error TwiML and does not delete verification", async () => {
    const supabase = makeSupabase({
      verification: { data: { id: 1, user_id: "u1" }, error: null },
      user: { data: null, error: null }, // covers verifiedNumbers default []
      updateError: { message: "bad" },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    const fd = new FormData();
    fd.set("Digits", "123456");
    fd.set("To", "+15551234567");
    const mod = await import("../app/routes/api.verify-pin-input");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(await res.text()).toBe("<Response />");
    expect(mocks.say).toHaveBeenCalledWith(
      "An error occurred while verifying your number. Please try again later."
    );
    expect((supabase as any)._spies.delEq).not.toHaveBeenCalled();
  });

  test("success updates user, deletes verification, and returns success TwiML", async () => {
    const supabase = makeSupabase({
      verification: { data: { id: 2, user_id: "u2" }, error: null },
      user: { data: { verified_audio_numbers: ["+1"] }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    const fd = new FormData();
    fd.set("Digits", "654321");
    fd.set("To", "+15551234567");
    const mod = await import("../app/routes/api.verify-pin-input");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(await res.text()).toBe("<Response />");
    expect((supabase as any)._spies.delEq).toHaveBeenCalledWith("id", 2);
    expect(mocks.say).toHaveBeenCalledWith(
      "Your phone number has been successfully verified. You may now hang up."
    );
    expect(mocks.hangup).toHaveBeenCalled();
  });
});

