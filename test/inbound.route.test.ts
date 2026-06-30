import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
  return {
    createClient: vi.fn(),
    sendWebhookNotification: vi.fn(),
    isPhoneNumber: vi.fn(),
    isEmail: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    findWorkspaceNumberByPhoneNumber: vi.fn(),
    upsertInboundCallRecord: vi.fn(),
    findInboundIvrScriptSteps: vi.fn(),
    getWorkspaceWebhookRow: vi.fn(),
    findActiveHandsetSessionClientIdentity: vi.fn(),
    resolveWorkspaceTwilioData: vi.fn(),
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "twilio-auth",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@client/client-js", () => ({
  createClient: (...a: any[]) => mocks.createClient(...a),
}));
vi.mock("@/lib/utils", () => ({
  isPhoneNumber: (...a: any[]) => mocks.isPhoneNumber(...a),
  isEmail: (...a: any[]) => mocks.isEmail(...a),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  sendWebhookNotification: (...a: any[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: mocks.validateTwilioWebhookParams,
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberByPhoneNumber: (...a: unknown[]) =>
    mocks.findWorkspaceNumberByPhoneNumber(...a),
  upsertInboundCallRecord: (...a: unknown[]) => mocks.upsertInboundCallRecord(...a),
  findInboundIvrScriptSteps: (...a: unknown[]) => mocks.findInboundIvrScriptSteps(...a),
  workspaceWebhookHasInboundCallInsert: (webhook: { event?: string[] | null } | null) =>
    Boolean(webhook?.event?.includes("INSERT")),
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceWebhookRow: (...a: unknown[]) => mocks.getWorkspaceWebhookRow(...a),
}));
vi.mock("@/lib/handset/handset-session.server", () => ({
  findActiveHandsetSessionClientIdentity: (...a: unknown[]) =>
    mocks.findActiveHandsetSessionClientIdentity(...a),
}));
vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/twilio-webhook.server")>();
  return {
    ...actual,
    resolveWorkspaceTwilioData: (...a: unknown[]) => mocks.resolveWorkspaceTwilioData(...a),
  };
});

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    pause(opts: any) {
      this.parts.push(`pause:${opts?.length}`);
    }
    dial(n?: string | Record<string, unknown>) {
      if (typeof n === "string") {
        this.parts.push(`dial:${n}`);
      }
      return {
        number: (number: string) => {
          this.parts.push(`dial:${number}`);
        },
      };
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

function defaultCallRow() {
  return {
    sid: "CA1",
    from: "f",
    to: "t",
    status: "completed",
    direction: "inbound",
    start_time: "now",
  };
}

function toInboundNumber(number: {
  id?: number;
  inbound_action?: string | null;
  inbound_audio?: string | null;
  inbound_ring_count?: number | null;
  inbound_script_id?: number | null;
  inbound_queue_id?: number | null;
  handset_enabled?: boolean | null;
  type?: string | null;
  workspace?: { id: string } | string | null;
}) {
  const workspaceId =
    number.workspace && typeof number.workspace === "object"
      ? number.workspace.id
      : typeof number.workspace === "string"
        ? number.workspace
        : "";
  return {
    id: number.id ?? 1,
    handset_enabled: number.handset_enabled ?? null,
    inbound_action: number.inbound_action ?? null,
    inbound_audio: number.inbound_audio ?? null,
    inbound_queue_id: number.inbound_queue_id ?? null,
    inbound_script_id: number.inbound_script_id ?? null,
    inbound_ring_count: number.inbound_ring_count ?? null,
    type: number.type ?? null,
    workspaceId,
  };
}

function makeDbClient(opts?: {
  voicemailSignedUrl?: string | null;
  voicemailList?: { id?: string; name: string }[] | null;
  voicemailListSpy?: (...args: unknown[]) => void;
}) {
  const client: {
    storage: {
      from: () => {
        list: (...args: unknown[]) => Promise<{ data: unknown[]; error: null }>;
        createSignedUrl: () => Promise<{ data: { signedUrl: string } | null; error: null }>;
      };
    };
  } = {
    storage: {
      from: () => ({
        list: async (...args: unknown[]) => {
          opts?.voicemailListSpy?.(...args);
          return { data: opts?.voicemailList ?? [], error: null };
        },
        createSignedUrl: async () => ({
          data: opts?.voicemailSignedUrl
            ? { signedUrl: opts.voicemailSignedUrl }
            : null,
          error: null,
        }),
      }),
    },
  };
  return client;
}

describe("app/routes/api+/inbound/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.sendWebhookNotification.mockReset();
    mocks.isPhoneNumber.mockReset();
    mocks.isEmail.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.findWorkspaceNumberByPhoneNumber.mockReset();
    mocks.upsertInboundCallRecord.mockReset();
    mocks.findInboundIvrScriptSteps.mockReset();
    mocks.getWorkspaceWebhookRow.mockReset();
    mocks.findActiveHandsetSessionClientIdentity.mockReset();
    mocks.resolveWorkspaceTwilioData.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.upsertInboundCallRecord.mockResolvedValue(defaultCallRow());
    mocks.findInboundIvrScriptSteps.mockResolvedValue(null);
    mocks.findActiveHandsetSessionClientIdentity.mockResolvedValue(null);
    mocks.resolveWorkspaceTwilioData.mockImplementation(
      async (_postgres, _workspaceId, twilioData) =>
        twilioData ?? { account_sid: "ac", auth_token: "at" },
    );
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
  });

  test("returns 400 when Called missing", async () => {
    const client = makeDbClient();
    mocks.createClient.mockReturnValueOnce(client);
    const mod = await import("../app/routes/api+/inbound");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", {
          method: "POST",
          body: new FormData(),
        }),
      } as any),
    );
    expect(res.status).toBe(400);
  });

  test("workspace number not found returns 404", async () => {
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(null);
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    const mod = await import("../app/routes/api+/inbound");
    const fd = new FormData();
    fd.set("Called", "+1");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as any),
    );
    expect(res.status).toBe(404);
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(
      toInboundNumber({
        inbound_action: null,
        inbound_audio: null,
        type: null,
        workspace: { id: "w1" },
      }),
    );
    mocks.createClient.mockReturnValueOnce(makeDbClient());

    const mod = await import("../app/routes/api+/inbound");
    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as any),
    );
    expect(res.status).toBe(403);
  });

  test("inserts call, optionally sends webhook, and returns TwiML for phone/email/none", async () => {
    const baseNumber = {
      inbound_action: "+15550001111",
      inbound_audio: null,
      type: "inbound",
      workspace: {
        id: "w1",
        twilio_data: { account_sid: "ac", auth_token: "at" },
        webhook: [{ events: [{ category: "inbound_call" }] }],
      },
    };
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.isEmail.mockReturnValue(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue(
      toInboundNumber(baseNumber),
    );
    mocks.getWorkspaceWebhookRow.mockResolvedValue({ event: ["INSERT"] });
    mocks.createClient.mockReturnValueOnce(makeDbClient());

    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");
    const mod = await import("../app/routes/api+/inbound");
    let res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toContain("dial:+15550001111");
    expect(mocks.sendWebhookNotification).toHaveBeenCalled();

    // email path with voicemail signedUrl => play+record
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(true);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue(
      toInboundNumber({
        ...baseNumber,
        inbound_action: "a@b.com",
        inbound_audio: "vm.mp3",
      }),
    );
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        voicemailSignedUrl: "https://signed",
        voicemailList: [{ name: "vm.mp3", id: "vm.mp3" }],
      }),
    );
    res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    const xml = await res.text();
    expect(xml).toContain("play:https://signed");
    expect(xml).toContain("record");

    // email path with no voicemail signedUrl => say+record
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(true);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue(
      toInboundNumber({
        ...baseNumber,
        inbound_action: "a@b.com",
        inbound_audio: "vm.mp3",
      }),
    );
    const fallbackListSpy = vi.fn();
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        voicemailSignedUrl: null,
        voicemailListSpy: fallbackListSpy,
      }),
    );
    res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(await res.text()).toContain("leave us a message");
    expect(fallbackListSpy).toHaveBeenCalledWith("w1", {
      search: "vm.mp3",
      limit: 20,
      offset: 0,
    });

    // else path => say "try again later"
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(
      toInboundNumber({ ...baseNumber, inbound_action: "noop" }),
    );
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({ event: ["INSERT"] });
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(await res.text()).toContain("unable to answer");
  });

  test("returns 400 for missing CallSid, 500 on call upsert error", async () => {
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue(
      toInboundNumber({
        inbound_action: null,
        inbound_audio: null,
        type: null,
        workspace: { id: "w1" },
      }),
    );
    mocks.getWorkspaceWebhookRow.mockResolvedValue({ event: [] });
    mocks.createClient.mockReturnValue(makeDbClient());
    const fd = new FormData();
    fd.set("Called", "+1");
    const mod = await import("../app/routes/api+/inbound");
    let res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as any),
    );
    expect(res.status).toBe(400);

    mocks.upsertInboundCallRecord.mockResolvedValueOnce(null);
    fd.set("CallSid", "CA1");
    res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as any),
    );
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error on function insert call",
      expect.objectContaining({ sid: "CA1", workspaceId: "w1" }),
    );
  });

  test("covers webhook absent, workspace id fallbacks, and null inbound action fallback", async () => {
    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");

    const mod = await import("../app/routes/api+/inbound");

    // No workspace credentials => signature validation fails
    mocks.isPhoneNumber.mockReturnValue(false);
    mocks.isEmail.mockReturnValue(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(null);
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as any),
    );
    expect(res.status).toBe(404);

    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.isEmail.mockReturnValue(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(
      toInboundNumber({
        inbound_action: null,
        inbound_audio: null,
        type: "inbound",
        workspace: { id: "" },
      }),
    );
    mocks.resolveWorkspaceTwilioData.mockResolvedValueOnce({
      account_sid: "ac",
      auth_token: "at",
    });
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({ event: ["INSERT"] });
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    const response = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(await response.text()).toContain("say:");

    // callWebhook empty => does not send webhook
    const prevCalls = mocks.sendWebhookNotification.mock.calls.length;
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(
      toInboundNumber({
        inbound_action: "+1555",
        inbound_audio: null,
        type: "inbound",
        workspace: { id: "w1" },
      }),
    );
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({ event: ["UPDATE"] });
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(mocks.sendWebhookNotification.mock.calls.length).toBe(prevCalls);
  });

  test("webhook notification failures are handled without blocking response", async () => {
    const mod = await import("../app/routes/api+/inbound");
    const fd = new FormData();
    fd.set("Called", "+1");
    fd.set("CallSid", "CA1");

    mocks.sendWebhookNotification.mockRejectedValueOnce(
      new Error("webhook down"),
    );
    mocks.isPhoneNumber.mockReturnValue(true);
    mocks.isEmail.mockReturnValue(false);
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValueOnce(
      toInboundNumber({
        inbound_action: "+1555",
        inbound_audio: null,
        type: "inbound",
        workspace: { id: "w1" },
      }),
    );
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({ event: ["INSERT"] });
    mocks.createClient.mockReturnValueOnce(makeDbClient());

    const response = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(response.headers.get("Content-Type")).toBe("text/xml");

    await Promise.resolve();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Failed to send inbound call webhook notification",
      expect.objectContaining({ workspaceId: "w1", callSid: "CA1" }),
    );
  });
});
