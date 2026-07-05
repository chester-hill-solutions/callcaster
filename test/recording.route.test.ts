import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireTwilioSignature: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  env: {
    BETTER_AUTH_URL: () => "https://sb.example",
    BETTER_AUTH_SERVICE_KEY: () => "svc",
  },
}));

vi.mock("@client/client-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api+/recording", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
  });

  test("returns 400 when CallSid missing", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(400);
  });

  test("returns 403 when validation fails", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns payload on happy path", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("RecordingUrl", "https://rec");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ CallSid: "CA1" });
  });
});
