import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    sendEmail: vi.fn(),
    sendWebhookNotification: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    fetch: vi.fn(),
    env: {
      RESEND_API_KEY: () => "rk",
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
  };
});

const telephonyDbMocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(),
  updateCallRecordingUrlBySid: vi.fn(),
}));

const inboundDbMocks = vi.hoisted(() => ({
  findWorkspaceNumberVoicemailContextByPhone: vi.fn(),
}));

const objectStorageMocks = vi.hoisted(() => ({
  uploadObject: vi.fn(),
  createSignedObjectUrl: vi.fn(),
}));

const credentialsMocks = vi.hoisted(() => ({
  readTwilioWorkspaceCredentials: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  sendWebhookNotification: (...args: unknown[]) => mocks.sendWebhookNotification(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: any[]) => telephonyDbMocks.findCallBySid(...args),
  updateCallRecordingUrlBySid: (...args: any[]) => telephonyDbMocks.updateCallRecordingUrlBySid(...args),
}));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberVoicemailContextByPhone: (...args: any[]) =>
    inboundDbMocks.findWorkspaceNumberVoicemailContextByPhone(...args),
}));
vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: (...args: any[]) => objectStorageMocks.uploadObject(...args),
  createSignedObjectUrl: (...args: any[]) => objectStorageMocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/twilio-workspace-credentials", () => ({
  readTwilioWorkspaceCredentials: (...args: any[]) =>
    credentialsMocks.readTwilioWorkspaceCredentials(...args),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: vi.fn(async () => (null)),
}));

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: any[]) => mocks.sendEmail(...args) };
    constructor(_k: string) {}
  }
  return { Resend };
});

function setupEmailVmMocks(overrides?: {
  callRow?: any;
  numberRow?: any;
  workspace?: any;
  uploadError?: any;
  signedUrlError?: any;
}) {
  const workspace = overrides?.workspace ?? {
    id: "w1",
    name: "W",
    twilio_data: { sid: "tsid", authToken: "ttok" },
    webhook: [],
  };

  const callRow = overrides?.callRow ?? {
    sid: "CA1",
    from: "+15550001111",
    to: "+15550002222",
  };

  const numberRow = {
    inbound_action: "notify@example.com",
    type: "inbound",
    workspace,
    ...(overrides?.numberRow ?? {}),
  };

  telephonyDbMocks.findCallBySid.mockResolvedValue(callRow);
  telephonyDbMocks.updateCallRecordingUrlBySid.mockResolvedValue(callRow);
  inboundDbMocks.findWorkspaceNumberVoicemailContextByPhone.mockResolvedValue(numberRow);
  objectStorageMocks.uploadObject.mockImplementation(async () => {
    if (overrides?.uploadError) throw overrides.uploadError;
  });
  objectStorageMocks.createSignedObjectUrl.mockImplementation(async () => {
    if (overrides?.signedUrlError) throw overrides.signedUrlError;
    return "https://signed";
  });
  credentialsMocks.readTwilioWorkspaceCredentials.mockReturnValue({
    sid: workspace.twilio_data?.sid ?? "tsid",
    authToken: workspace.twilio_data?.authToken ?? "ttok",
  });
}

function makeReq(fields: Record<string, any>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    fd.set(k, v);
  }
  return new Request("http://localhost/api/email-vm", { method: "POST", body: fd });
}

describe("app/routes/api+/email-vm/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.sendEmail.mockReset();
    mocks.sendWebhookNotification.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    telephonyDbMocks.findCallBySid.mockReset();
    telephonyDbMocks.updateCallRecordingUrlBySid.mockReset();
    inboundDbMocks.findWorkspaceNumberVoicemailContextByPhone.mockReset();
    objectStorageMocks.uploadObject.mockReset();
    objectStorageMocks.createSignedObjectUrl.mockReset();
    credentialsMocks.readTwilioWorkspaceCredentials.mockReset();
    setupEmailVmMocks();
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    const { requireTwilioSignature } = await import("@/lib/twilio-webhook.server");
    vi.mocked(requireTwilioSignature).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(
      await mod.action({
        request: makeReq({
          RecordingUrl: "https://tw/rec",
          CallSid: "CA1",
          AccountSid: "AC1",
          RecordingSid: "RE1",
        }),
        params: {},
      } as any),
    );
    expect(res.status).toBe(403);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  test("success path sends email and (optionally) webhook", async () => {
    setupEmailVmMocks({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [
          { events: ["voicemail"] },
          { events: ["other"] },
        ],
      },
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
        RecordingDuration: "12",
      }),
      params: {},
    } as any));
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
    setupEmailVmMocks({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [{ events: [{ category: "other" }] }],
      },
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
      }),
      params: {},
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("covers webhook events fallback, to:'' fallback, and duration undefined branch", async () => {
    setupEmailVmMocks({
      workspace: {
        id: "w1",
        name: "W",
        twilio_data: { sid: "tsid", authToken: "ttok" },
        webhook: [
          { events: undefined }, // non-array events is skipped by the filter
          { events: ["voicemail"] },
        ],
      },
      numberRow: { inbound_action: null },
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
        // omit RecordingDuration => duration undefined in webhook payload
      }),
      params: {},
    } as any));
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
    const mod = await import("../app/routes/api+/email-vm");
    mocks.fetch.mockResolvedValue({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);

    // RecordingUrl missing
    let res = await asRouteResponse(await mod.action({ request: makeReq({ CallSid: "CA1" }), params: {} } as any));
    expect(res.status).toBe(500);

    // CallSid missing
    res = await asRouteResponse(await mod.action({ request: makeReq({ RecordingUrl: "x" }), params: {} } as any));
    expect(res.status).toBe(500);

    // AccountSid missing
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    // RecordingSid missing
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    // non-string RecordingUrl (File)
    res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: new File(["x"], "f.txt"),
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
      }),
      params: {},
    } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("webhook retry: does not resend email when the call's recording URL already matches", async () => {
    setupEmailVmMocks({
      callRow: {
        sid: "CA1",
        from: "+15550001111",
        to: "+15550002222",
        recording_url: "https://tw/rec",
      },
    });

    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE1",
      }),
      params: {},
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(objectStorageMocks.uploadObject).not.toHaveBeenCalled();
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("does not skip processing when the recording URL differs from what's stored (new voicemail on same call)", async () => {
    setupEmailVmMocks({
      callRow: {
        sid: "CA1",
        from: "+15550001111",
        to: "+15550002222",
        recording_url: "https://tw/old-rec",
      },
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    mocks.sendEmail.mockResolvedValueOnce({ id: "em1" });

    const mod = await import("../app/routes/api+/email-vm");
    const res = await asRouteResponse(await mod.action({
      request: makeReq({
        RecordingUrl: "https://tw/new-rec",
        CallSid: "CA1",
        AccountSid: "AC1",
        RecordingSid: "RE2",
      }),
      params: {},
    } as any));

    expect(res.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalled();
  });

  test("covers helper error branches (call not found, number not found, missing workspace/twilio_data, fetch !ok, uploadError, signedUrlError)", async () => {
    const mod = await import("../app/routes/api+/email-vm");

    telephonyDbMocks.findCallBySid.mockResolvedValueOnce(null);
    let res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    setupEmailVmMocks();
    inboundDbMocks.findWorkspaceNumberVoicemailContextByPhone.mockResolvedValueOnce(null);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    setupEmailVmMocks();
    credentialsMocks.readTwilioWorkspaceCredentials.mockReturnValueOnce(null);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    setupEmailVmMocks();
    mocks.fetch.mockResolvedValueOnce({ ok: false, statusText: "nope" } as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    setupEmailVmMocks();
    objectStorageMocks.uploadObject.mockRejectedValueOnce(new Error("up"));
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);

    setupEmailVmMocks();
    objectStorageMocks.createSignedObjectUrl.mockRejectedValueOnce(new Error("sig"));
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["abc"], { type: "audio/mpeg" }),
    } as any);
    res = await asRouteResponse(await mod.action({
      request: makeReq({ RecordingUrl: "x", CallSid: "CA1", AccountSid: "AC1", RecordingSid: "RE1" }),
      params: {},
    } as any));
    expect(res.status).toBe(500);
  });
});
