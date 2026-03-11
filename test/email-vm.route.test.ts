import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    sendEmail: vi.fn(),
    sendWebhookNotification: vi.fn(),
    logger: { error: vi.fn() },
    fetch: vi.fn(),
    env: {
      RESEND_API_KEY: () => "rk",
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils", () => ({
  sendWebhookNotification: (...args: any[]) => mocks.sendWebhookNotification(...args),
}));

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: any[]) => mocks.sendEmail(...args) };
    constructor(_k: string) {}
  }
  return { Resend };
});

function makeSupabase(overrides?: {
  callError?: { message: string } | null;
  numberError?: { message: string } | null;
  workspace?: any;
  uploadError?: { message: string } | null;
  signedUrlError?: { message: string } | null;
}) {
  const callRow = {
    sid: "CA1",
    from: "+15550001111",
    to: "+15550002222",
  };
  const hasWorkspaceOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, "workspace"));
  const workspace = hasWorkspaceOverride
    ? overrides!.workspace
    : ({
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [],
      } as any);

  const numberRow = {
    inbound_action: "notify@example.com",
    type: "inbound",
    workspace,
  };

  const upload = vi.fn(async () => ({
    data: { path: "p" },
    error: overrides?.uploadError ?? null,
  }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://signed" },
    error: overrides?.signedUrlError ?? null,
  }));

  const supabase: any = {
    from: (table: string) => {
      if (table === "call") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: callRow,
                  error: overrides?.callError ?? null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: numberRow,
                error: overrides?.numberError ?? null,
              }),
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
    storage: {
      from: (_b: string) => ({
        upload,
        createSignedUrl,
      }),
    },
    _upload: upload,
    _createSignedUrl: createSignedUrl,
    _numberRow: numberRow,
  };

  return supabase;
}

function makeReq(fields: Record<string, any>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    fd.set(k, v);
  }
  return new Request("http://localhost/api/email-vm", { method: "POST", body: fd });
}

describe("app/routes/api.email-vm.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.sendEmail.mockReset();
    mocks.sendWebhookNotification.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("success path sends email and (optionally) webhook", async () => {
    const supabase = makeSupabase({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [
          { events: [{ category: "voicemail" }] },
          { events: [{ category: "other" }] },
        ],
      },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api.email-vm");
    const res = await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
        RecordingDuration: "12",
      }),
      params: {},
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["notify@example.com"],
      }),
    );
    expect(mocks.sendWebhookNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "voicemail",
        payload: expect.objectContaining({ duration: "12" }),
      }),
    );
  });

  test("success path with no matching webhook does not call sendWebhookNotification", async () => {
    const supabase = makeSupabase({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [{ events: [{ category: "other" }] }],
      },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api.email-vm");
    const res = await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
      }),
      params: {},
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("covers webhook events fallback, to:'' fallback, and duration undefined branch", async () => {
    const supabase = makeSupabase({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [
          { events: undefined }, // events?.filter || []
          { events: [{ category: "voicemail" }] },
        ],
      },
    });
    // inbound_action null => action?.toString() || ''
    supabase._numberRow.inbound_action = null;
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api.email-vm");
    const res = await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
        // omit RecordingDuration => duration undefined in webhook payload
      }),
      params: {},
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [""] }),
    );
    expect(mocks.sendWebhookNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ duration: undefined }),
      }),
    );
  });

  test("validates required fields and returns 500 on failures", async () => {
    const mod = await import("../app/routes/api.email-vm");
    mocks.createClient.mockReturnValue(makeSupabase());
    mocks.fetch.mockResolvedValue({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);

    // RecordingUrl missing
    let res = await mod.action({ request: makeReq({ CallSid: "CA1" }), params: {} } as any);
    expect(res.status).toBe(500);

    // CallSid missing
    res = await mod.action({ request: makeReq({ RecordingUrl: "x" }), params: {} } as any);
    expect(res.status).toBe(500);

    // AccountSid missing
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    // RecordingSid missing
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    // non-string RecordingUrl (File)
    res = await mod.action({
      request: makeReq({
        RecordingUrl: new File(["x"], "f.txt"),
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
      }),
      params: {},
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers supabase and fetch error branches (callError, numberError, missing workspace/twilio_data, fetch !ok, uploadError, signedUrlError)", async () => {
    const mod = await import("../app/routes/api.email-vm");

    mocks.createClient.mockReturnValueOnce(
      makeSupabase({ callError: { message: "call" } }),
    );
    let res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    mocks.createClient.mockReturnValueOnce(
      makeSupabase({ numberError: { message: "num" } }),
    );
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    mocks.createClient.mockReturnValueOnce(makeSupabase({ workspace: null }));
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    mocks.createClient.mockReturnValueOnce(
      makeSupabase({ workspace: { id: "w1", name: "W", twilio_data: null, webhook: [] } }),
    );
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    const supOk = makeSupabase();
    mocks.createClient.mockReturnValueOnce(supOk);
    mocks.fetch.mockResolvedValueOnce({ ok: false, statusText: "nope" } as any);
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    const supUploadErr = makeSupabase({ uploadError: { message: "up" } });
    mocks.createClient.mockReturnValueOnce(supUploadErr);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);

    const supSignedErr = makeSupabase({ signedUrlError: { message: "sig" } });
    mocks.createClient.mockReturnValueOnce(supSignedErr);
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    res = await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any);
    expect(res.status).toBe(500);
  });
});

