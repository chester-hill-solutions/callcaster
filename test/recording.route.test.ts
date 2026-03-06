import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
    },
    logger: { debug: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.recording.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.logger.debug.mockReset();
  });

  test("returns json of form data and logs debug", async () => {
    mocks.createClient.mockReturnValueOnce({});
    const fd = new FormData();
    fd.set("RecordingSid", "RE1");
    fd.set("CallSid", "CA1");
    const mod = await import("../app/routes/api.recording");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
      params: {},
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ RecordingSid: "RE1", CallSid: "CA1" });
    expect(mocks.createClient).toHaveBeenCalledWith("http://supabase", "service");
    expect(mocks.logger.debug).toHaveBeenCalledWith("Recording webhook received", {
      data: { RecordingSid: "RE1", CallSid: "CA1" },
    });
  });
});

