import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    sendWebhookNotification: vi.fn(),
    isPhoneNumber: vi.fn(),
    isEmail: vi.fn(),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/lib/utils", () => ({
  isPhoneNumber: (...a: any[]) => mocks.isPhoneNumber(...a),
  isEmail: (...a: any[]) => mocks.isEmail(...a),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils", () => ({
  sendWebhookNotification: (...a: any[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    pause(opts: any) {
      this.parts.push(`pause:${opts?.length}`);
    }
    dial(n: string) {
      this.parts.push(`dial:${n}`);
    }
    play(u: string) {
      this.parts.push(`play:${u}`);
    }
    say(t: string) {
      this.parts.push(`say:${t}`);
    }
    record(_opts: any) {
      this.parts.push("record");
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeSupabase(opts?: {
  number?: any;
  numberError?: any;
  voicemailSignedUrl?: string | null;
  voicemailList?: { id?: string; name: string }[] | null;
  callError?: any;
  callRow?: any;
}) {
  const supabase: any = {
    storage: {
      from: () => ({
        list: async () => ({ data: opts?.voicemailList ?? [], error: null }),
        createSignedUrl: async () => ({
          data: opts?.voicemailSignedUrl ? { signedUrl: opts.voicemailSignedUrl } : null,
          error: null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts?.number ?? null, error: opts?.numberError ?? null }),
            }),
          }),
        };
      }
      if (table === "call") {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: opts?.callRow ?? { sid: "CA1", from: "f", to: "t", status: "completed", direction: "inbound", start_time: "now" }, error: opts?.callError ?? null }),
            }),
          }),
        };
      }
      throw new Error("unexpected");
    },
  };
  return supabase;
}

describe("app/routes/api.inbound.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.sendWebhookNotification.mockReset();
    mocks.isPhoneNumber.mockReset();
    mocks.isEmail.mockReset();
    mocks.logger.error.mockReset();
  });

  test("throws 400-like object when Called missing", async () => {
    const supabase = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supabase);
    const mod = await import("../app/routes/api.inbound");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: new FormData() }) } as any)).rejects.toMatchObject({ status: 400 });
  });

  test("workspace number errors/not found throw", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: null, numberError: null }));
    const mod = await import("../app/routes/api.inbound");
    const fd = new FormData();
    fd.set("Called", "+1");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toMatchObject({ status: 404 });

    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: { inbound_action: null, inbound_audio: null, type: null, workspace: { id: "w1", twilio_data: null, webhook: [] } }, numberError: new Error("n") }));
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toMatchObject({ status: 500 });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("inserts call, optionally sends webhook, and returns TwiML for phone/email/none", async () => {
    const baseNumber = {
      inbound_action: "+15550001111",
      inbound_audio: null,
      type: "inbound",
      workspace: { id: "w1", twilio_data: { account_sid: "ac", auth_token: "at" }, webhook: [{ events: [{ category: "inbound_call" }] }] },
    };
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.isEmail.mockReturnValue(false);
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: baseNumber }));

    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");
    const mod = await import("../app/routes/api.inbound");
    let res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toContain("dial:+15550001111");
    expect(mocks.sendWebhookNotification).toHaveBeenCalled();

    // email path with voicemail signedUrl => play+record
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(true);
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: { ...baseNumber, inbound_action: "a@b.com", inbound_audio: "vm.mp3" },
        voicemailSignedUrl: "https://signed",
        voicemailList: [{ name: "vm.mp3", id: "vm.mp3" }],
      })
    );
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    const xml = await res.text();
    expect(xml).toContain("play:https://signed");
    expect(xml).toContain("record");

    // email path with no voicemail signedUrl => say+record
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(true);
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: { ...baseNumber, inbound_action: "a@b.com", inbound_audio: "vm.mp3" },
        voicemailSignedUrl: null,
      }),
    );
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(await res.text()).toContain("leave us a message");

    // else path => say "try again later"
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(false);
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: { ...baseNumber, inbound_action: "noop" } }));
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(await res.text()).toContain("unable to answer");
  });

  test("throws for missing CallSid, logs+throws on call upsert error", async () => {
    const baseNumber = { inbound_action: null, inbound_audio: null, type: null, workspace: { id: "w1", twilio_data: { account_sid: "ac", auth_token: "at" }, webhook: [] } };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: baseNumber }));
    const fd = new FormData();
    fd.set("Called", "+1");
    const mod = await import("../app/routes/api.inbound");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toMatchObject({ status: 400 });

    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: baseNumber, callError: new Error("call") }));
    fd.set("CallSid", "CA1");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toMatchObject({ status: 500 });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error on function insert call", expect.any(Error));
  });

  test("covers webhook absent, workspace id fallbacks, and null inbound action fallback", async () => {
    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");

    const mod = await import("../app/routes/api.inbound");

    // No workspace => callWebhook [], workspace null in call insert
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(false);
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: { inbound_action: null, inbound_audio: null, type: null, workspace: null },
      }),
    );
    let res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");

    // Workspace id empty string => workspaceId fallback "" in webhook notification
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.isEmail.mockReturnValue(false);
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: {
          inbound_action: null,
          inbound_audio: null,
          type: "inbound",
          workspace: { id: "", twilio_data: { account_sid: "ac", auth_token: "at" }, webhook: [{ events: [{ category: "inbound_call" }] }] },
        },
      }),
    );
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(await res.text()).toContain("say:");

    // callWebhook empty => does not send webhook
    const prevCalls = mocks.sendWebhookNotification.mock.calls.length;
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: {
          inbound_action: "+1555",
          inbound_audio: null,
          type: "inbound",
          workspace: { id: "w1", twilio_data: { account_sid: "ac", auth_token: "at" }, webhook: [{ events: [{ category: "other" }] }] },
        },
      }),
    );
    await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(mocks.sendWebhookNotification.mock.calls.length).toBe(prevCalls);
  });
});

