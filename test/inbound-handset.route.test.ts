import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(),
  findWorkspaceNumberByPhoneNumber: vi.fn(),
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
  },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const handsetSessionMocks = vi.hoisted(() => ({
  findActiveHandsetSessionClientIdentity: vi.fn(async () => "agent-1"),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
}));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberByPhoneNumber: (...args: unknown[]) =>
    mocks.findWorkspaceNumberByPhoneNumber(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/handset/handset-session.server", () => ({
  findActiveHandsetSessionClientIdentity: (...args: unknown[]) =>
    handsetSessionMocks.findActiveHandsetSessionClientIdentity(...args),
}));

vi.mock("twilio", () => {
  class VoiceResponse {
    private parts: string[] = [];
    say(text: string) {
      this.parts.push(`say:${text}`);
    }
    hangup() {
      this.parts.push("hangup");
    }
    dial() {
      return {
        client: (identity: string) => {
          this.parts.push(`client:${identity}`);
        },
      };
    }
    toString() {
      return `<Response>${this.parts.join("|")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeRequest(called = "+15551234567") {
  const fd = new FormData();
  fd.set("Called", called);
  return new Request("http://localhost/api/inbound-handset", { method: "POST", body: fd });
}

describe("app/routes/api+/inbound-handset", () => {
  beforeEach(() => {
    vi.resetModules();
    handsetSessionMocks.findActiveHandsetSessionClientIdentity.mockReset();
    handsetSessionMocks.findActiveHandsetSessionClientIdentity.mockResolvedValue("agent-1");
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.findWorkspaceNumberByPhoneNumber.mockReset();
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue({
      workspace: "w1",
      workspaceId: "w1",
      handset_enabled: true,
    } as any);
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest() } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when Called is empty", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Missing phone number" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/inbound-handset");
    const fd = new FormData();
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/inbound-handset", {
          method: "POST",
          body: fd,
        }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 403 when phone number is not found", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest("+19999999999") } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns TwiML dialing client on happy path", async () => {
    const mod = await import("../app/routes/api+/inbound-handset");
    const res = await asRouteResponse(await mod.action({ request: makeRequest() } as never));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    const text = await res.text();
    expect(text).toContain("client:agent-1");
  });
});
