import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    testWebhook: vi.fn(),
    logger: { warn: vi.fn() },
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils", () => ({
  testWebhook: (...args: any[]) => mocks.testWebhook(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.test-webhook.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.testWebhook.mockReset();
    mocks.logger.warn.mockReset();
  });

  test("returns 400 on invalid input (event not object or destination_url not string)", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      event: JSON.stringify("nope"),
      destination_url: 123,
      custom_headers: JSON.stringify([]),
    });
    const mod = await import("../app/routing/api/api.test-webhook");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input" });
    expect(mocks.logger.warn).toHaveBeenCalledWith("Invalid input for webhook test");
  });

  test("parses headers and returns testWebhook result", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      event: JSON.stringify({ category: "outbound_sms" }),
      destination_url: "http://hook",
      custom_headers: JSON.stringify([["X-Test", "1"]]),
    });
    mocks.testWebhook.mockResolvedValueOnce({ ok: true });
    const mod = await import("../app/routing/api/api.test-webhook");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.testWebhook).toHaveBeenCalledWith({ category: "outbound_sms" }, "http://hook", { "X-Test": "1" });
  });
});

