import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  validateTwilioWebhookForPhoneNumber: vi.fn(),
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
    BASE_URL: () => "https://app.example",
  },
}));

vi.mock("@client/client-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForPhoneNumber: (...args: unknown[]) =>
    mocks.validateTwilioWebhookForPhoneNumber(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    say(_opts: unknown, text: string) {
      this.parts.push(`say:${text}`);
    }
    play(url: string) {
      this.parts.push(`play:${url}`);
    }
    pause() {
      this.parts.push("pause");
    }
    record() {
      this.parts.push("record");
    }
    hangup() {
      this.parts.push("hangup");
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeDbClient(numberRow: {
  inbound_action: string | null;
  inbound_audio: string | null;
  workspace: string;
} | null) {
  return {
    from: (table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: numberRow, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
  };
}

function makeRequest(opts?: { called?: string; dialCallStatus?: string }) {
  const fd = new FormData();
  if (opts?.called !== undefined) {
    fd.set("Called", opts.called);
  }
  if (opts?.dialCallStatus) {
    fd.set("DialCallStatus", opts.dialCallStatus);
  }
  return new Request("http://localhost/api/inbound-handset-dial-end", {
    method: "POST",
    body: fd,
  });
}

describe("app/routes/api+/inbound-handset-dial-end", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookForPhoneNumber.mockReset();
    mocks.createClient.mockReturnValue(
      makeDbClient({
        inbound_action: null,
        inbound_audio: null,
        workspace: "w1",
      }),
    );
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValue({
      ok: true,
      params: { Called: "+15551234567", DialCallStatus: "no-answer" },
      authToken: "tok",
      workspaceId: "w1",
      twilioData: { sid: "AC1", authToken: "tok" },
    });
  });

  test("returns 405 for non-POST", async () => {
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/inbound-handset-dial-end", {
        method: "GET",
      }),
    } as never));
    expect(res.status).toBe(405);
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(
      await mod.action({
        request: makeRequest({ called: "+15551234567" }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when Called is empty", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Missing phone number" }), {
        status: 403,
      }),
    });
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest({ called: "" }) } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when phone number is not found", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(
      await mod.action({
        request: makeRequest({ called: "+19999999999" }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns TwiML with no-answer message on happy path", async () => {
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(await mod.action({
      request: makeRequest({ called: "+15551234567", dialCallStatus: "no-answer" }),
    } as never));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const text = await res.text();
    expect(text).toContain("No one is available");
    expect(text).toContain("hangup");
  });

  test("returns voicemail TwiML when handset misses and inbound action is email", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeDbClient({
        inbound_action: "notify@example.com",
        inbound_audio: null,
        workspace: "w1",
      }),
    );
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(await mod.action({
      request: makeRequest({ called: "+15551234567", dialCallStatus: "no-answer" }),
    } as never));
    const text = await res.text();
    expect(text).toContain("record");
    expect(text).not.toContain("No one is available");
  });

  test("returns TwiML hangup only when dial completed", async () => {
    mocks.validateTwilioWebhookForPhoneNumber.mockResolvedValueOnce({
      ok: true,
      params: { Called: "+15551234567", DialCallStatus: "completed" },
      authToken: "tok",
      workspaceId: "w1",
      twilioData: { sid: "AC1", authToken: "tok" },
    });
    const mod = await import("../app/routes/api+/inbound-handset-dial-end");
    const res = await asRouteResponse(await mod.action({
      request: makeRequest({ called: "+15551234567", dialCallStatus: "completed" }),
    } as never));
    const text = await res.text();
    expect(text).not.toContain("No one is available");
    expect(text).toContain("hangup");
  });
});
