import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    send: vi.fn(),
    safeParseJson: vi.fn(),
    verifyAuth: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/env.server", () => ({ env: { RESEND_API_KEY: () => "rk" } }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/database.server", () => ({ safeParseJson: (...a: any[]) => mocks.safeParseJson(...a) }));
vi.mock("@/lib/supabase.server", () => ({ verifyAuth: (...a: any[]) => mocks.verifyAuth(...a) }));

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: any[]) => mocks.send(...args) };
    constructor(_k: string) {}
  }
  return { Resend };
});

describe("app/routes/api.error-report.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.send.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.verifyAuth.mockReset();
    mocks.logger.error.mockReset();
  });

  test("sends report using user.email fallback and returns success", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ e: 1 });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: {},
      user: { email: "", user_metadata: { email: "m@e.com" } },
    });
    mocks.send.mockResolvedValueOnce({ id: "em" });
    const mod = await import("../app/routes/api.error-report");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "1" },
    } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "m@e.com" }),
    );
  });

  test("returns 500 on error", async () => {
    mocks.safeParseJson.mockRejectedValueOnce(new Error("boom"));
    const mod = await import("../app/routes/api.error-report");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { id: "1" },
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to process error report" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

