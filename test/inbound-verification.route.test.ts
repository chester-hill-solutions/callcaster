import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const say = vi.fn();
  const hangup = vi.fn();
  const toString = vi.fn(() => "<Response />");
  const VoiceResponse = vi.fn(function (this: unknown) {
    return { say, hangup, toString };
  });
  return {
    createClient: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { debug: vi.fn(), error: vi.fn() },
    VoiceResponse,
    say,
    hangup,
    toString,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("twilio", () => ({
  default: { twiml: { VoiceResponse: mocks.VoiceResponse } },
}));

function makeSupabase(opts: {
  session?: { data: unknown; error: unknown } | null;
  user?: { data: unknown; error: unknown };
  updateError?: unknown;
}) {
  const updateEq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  return {
    from: vi.fn((table: string) => {
      if (table === "verification_session") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(
                        async () =>
                          opts.session ?? {
                            data: null,
                            error: { message: "no session" },
                          }
                      ),
                    })),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: updateEq,
          })),
        };
      }
      if (table === "user") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(
                async () =>
                  opts.user ?? {
                    data: { verified_audio_numbers: [] },
                    error: null,
                  }
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: updateEq,
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    _spies: { updateEq },
  };
}

describe("app/routes/api.inbound-verification.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.VoiceResponse.mockClear();
    mocks.say.mockReset();
    mocks.hangup.mockReset();
    mocks.toString.mockReset();
    mocks.toString.mockReturnValue("<Response />");
  });

  test("action returns error TwiML when From missing", async () => {
    mocks.createClient.mockReturnValue(
      makeSupabase({ session: { data: null, error: null } })
    );
    const formData = new FormData();
    const mod = await import("../app/routes/api.inbound-verification");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.say).toHaveBeenCalledWith(
      "Invalid request. Missing caller information."
    );
  });

  test("action returns error TwiML when no matching session", async () => {
    const supabase = makeSupabase({
      session: { data: null, error: null },
    });
    mocks.createClient.mockReturnValue(supabase);
    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api.inbound-verification");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never);
    expect(mocks.say).toHaveBeenCalledWith(
      expect.stringContaining("No active verification session")
    );
  });

  test("action success updates user and returns success TwiML", async () => {
    const updateEq = vi.fn(async () => ({ error: null }));
    const supabase: ReturnType<typeof makeSupabase> = makeSupabase({
      session: {
        data: {
          id: "vs-1",
          user_id: "u1",
          expected_caller: "+15551234567",
        },
        error: null,
      },
      user: {
        data: { verified_audio_numbers: [] },
        error: null,
      },
    });
    (supabase as { _spies?: { updateEq: ReturnType<typeof vi.fn> } })._spies =
      { updateEq };
    mocks.createClient.mockReturnValue(supabase);

    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api.inbound-verification");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.say).toHaveBeenCalledWith(
      "Your phone number has been successfully verified. You may now hang up."
    );
  });

  test("action handles already-verified number", async () => {
    const supabase = makeSupabase({
      session: {
        data: {
          id: "vs-1",
          user_id: "u1",
          expected_caller: "+15551234567",
        },
        error: null,
      },
      user: {
        data: { verified_audio_numbers: ["+15551234567"] },
        error: null,
      },
    });
    mocks.createClient.mockReturnValue(supabase);

    const formData = new FormData();
    formData.set("From", "+15551234567");
    const mod = await import("../app/routes/api.inbound-verification");
    const res = await mod.action({
      request: new Request("http://x", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(mocks.say).toHaveBeenCalledWith(
      "This number is already verified."
    );
  });
});
