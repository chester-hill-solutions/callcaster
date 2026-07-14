import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireTwilioSignature: vi.fn(),
  updateCallRecordingUrlBySid: vi.fn(),
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
vi.mock("@/lib/telephony-db.server", () => ({
  updateCallRecordingUrlBySid: (...args: unknown[]) =>
    mocks.updateCallRecordingUrlBySid(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

const enqueueJobMock = vi.hoisted(() => vi.fn(async () => ({ enqueued: true, jobId: 1 })));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

describe("app/routes/api+/recording", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.updateCallRecordingUrlBySid.mockReset();
    mocks.updateCallRecordingUrlBySid.mockResolvedValue({ sid: "CA1", workspace: "w1" });
    mocks.logger.error.mockReset();
    enqueueJobMock.mockReset();
    enqueueJobMock.mockResolvedValue({ enqueued: true, jobId: 1 });
  });

  test("returns 400 when CallSid missing", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    const res = await asRouteResponse(mod.action({
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
    const res = await asRouteResponse(mod.action({
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
    const res = await asRouteResponse(mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ CallSid: "CA1" });
    // Regression guard: the recordingStatusCallback must persist the
    // recording URL, not just echo the webhook params back. See
    // app/routes/api+/call.action.server.ts (recordingStatusCallback wiring)
    // and app/lib/telephony-db.server.ts:updateCallRecordingUrlBySid.
    expect(mocks.updateCallRecordingUrlBySid).toHaveBeenCalledWith("CA1", "https://rec");
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recording_side_effects" }),
    );
  });

  test("does not attempt to persist when RecordingUrl is missing", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    const res = await asRouteResponse(mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateCallRecordingUrlBySid).not.toHaveBeenCalled();
  });

  test("still returns 200 with payload when persistence fails (webhook must not fail loudly)", async () => {
    mocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    mocks.updateCallRecordingUrlBySid.mockRejectedValueOnce(new Error("db down"));
    const mod = await import("../app/routes/api+/recording");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("RecordingUrl", "https://rec");
    const res = await asRouteResponse(mod.action({
        request: new Request("http://x", { method: "POST", body: fd }),
      } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ CallSid: "CA1" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
