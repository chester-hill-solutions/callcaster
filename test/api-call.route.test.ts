import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";

const twilioMocks = vi.hoisted(() => {
  return {
    dialNumber: vi.fn(),
    say: vi.fn(),
    dial: vi.fn(),
    toString: vi.fn(() => "<Response/>"),
  };
});

const loggerMocks = vi.hoisted(() => ({ warn: vi.fn() }));

const handsetState = vi.hoisted(() => ({
  activeSession: true,
  handsetNumber: null as string | null,
}));

const telephonyDbMocks = vi.hoisted(() => ({
  insertCallForWorkspace: vi.fn(async () => ({})),
}));

vi.mock("@/lib/handset/handset-session.server", () => ({
  findActiveHandsetSession: vi.fn(async () =>
    handsetState.activeSession ? { workspace_id: "w1", user_id: "u1" } : null,
  ),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: (...args: any[]) => telephonyDbMocks.insertCallForWorkspace(...args),
}));

vi.mock("@/lib/database/workspace.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/database/workspace.server")
  >("@/lib/database/workspace.server");
  return {
    ...actual,
    getHandsetNumberForWorkspace: vi.fn(async () => ({
      data: handsetState.handsetNumber
        ? { id: 1, phone_number: handsetState.handsetNumber }
        : null,
      error: null,
    })),
  };
});

vi.mock("twilio", () => {
  class VoiceResponse {
    dial(opts: any) {
      twilioMocks.dial(opts);
      return { number: twilioMocks.dialNumber };
    }
    say(text: string) {
      twilioMocks.say(text);
    }
    toString() {
      return twilioMocks.toString();
    }
  }

  return {
    default: {
      twiml: { VoiceResponse },
    },
  };
});

vi.mock("@/lib/env.server", () => {
  return {
    env: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "BASE_URL") return () => "https://base.example";
          if (prop === "TWILIO_PHONE_NUMBER") return () => "+15551234567";
          return () => "test";
        },
      },
    ),
  };
});

vi.mock("@/lib/logger.server", () => ({ logger: loggerMocks }));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: vi.fn(async () => null),
}));

describe("app/routes/api+/call/route.tsx", () => {
  beforeEach(() => {
    twilioMocks.dialNumber.mockReset();
    twilioMocks.say.mockReset();
    twilioMocks.dial.mockReset();
    twilioMocks.toString.mockClear();
    loggerMocks.warn.mockReset();
    handsetState.activeSession = true;
    handsetState.handsetNumber = null;
    telephonyDbMocks.insertCallForWorkspace.mockReset();
    vi.resetModules();
  });

  test("action dials when To is phone-like", async () => {
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    await res.text();
    expect(twilioMocks.dial).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: "+15551234567",
        record: "record-from-answer",
        recordingStatusCallback: "https://base.example/api/recording",
        transcribe: true,
        transcribeCallback: "https://base.example/api/transcribe",
      }),
    );
    expect(twilioMocks.dialNumber).toHaveBeenCalledWith("+15555550100");
    expect(twilioMocks.say).not.toHaveBeenCalled();
  });

  test("action says invalid when To contains invalid chars", async () => {
    twilioMocks.dial.mockClear();
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "not-a-phone");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    await res.text();
    expect(twilioMocks.say).toHaveBeenCalledWith(
      "The provided phone number is invalid.",
    );
    expect(twilioMocks.dial).not.toHaveBeenCalled();
  });

  test("handset flow rejects when no active handset session", async () => {
    handsetState.activeSession = false;
    handsetState.handsetNumber = "+15551230000";
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    fd.set("workspace_id", "w1");
    fd.set("client_identity", "client-abc");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    await res.text();
    expect(twilioMocks.say).toHaveBeenCalledWith(
      "Your handset session has expired. Please refresh the page.",
    );
    expect(twilioMocks.dial).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  test("handset flow persists call row and dials with workspace caller id", async () => {
    handsetState.handsetNumber = "+15559876543";
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    fd.set("workspace_id", "w1");
    fd.set("client_identity", "client-abc");
    fd.set("CallSid", "CA_HANDSET");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    await res.text();
    expect(telephonyDbMocks.insertCallForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        sid: "CA_HANDSET",
        workspace: "w1",
        user_id: "u1",
        to: "+15555550100",
        from: "+15559876543",
        status: "initiated",
      }),
    );
    expect(twilioMocks.dial).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: "+15559876543",
      }),
    );
    expect(twilioMocks.dialNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        machineDetection: "Enable",
        statusCallback: "https://base.example/api/call-status/",
      }),
      "+15555550100",
    );
  });

  test("handset flow says no caller id when workspace has no valid number", async () => {
    handsetState.handsetNumber = null;
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    fd.set("workspace_id", "w1");
    fd.set("client_identity", "client-abc");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    await res.text();
    expect(twilioMocks.say).toHaveBeenCalledWith(
      "No caller ID is configured for this workspace.",
    );
    expect(twilioMocks.dial).not.toHaveBeenCalled();
  });

  test("falls back to default dial path when client_identity is missing", async () => {
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    fd.set("To", "+15555550100");
    fd.set("workspace_id", "w1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    await res.text();
    expect(twilioMocks.dial).toHaveBeenCalledWith(
      expect.objectContaining({ callerId: "+15551234567" }),
    );
  });

  test("says invalid when To is missing", async () => {
    const mod = await import("../app/routes/api+/call");
    const fd = new FormData();
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/call", {
        method: "POST",
        body: fd,
      }),
    } as any));

    await res.text();
    expect(twilioMocks.say).toHaveBeenCalledWith(
      "The provided phone number is invalid.",
    );
  });
});
