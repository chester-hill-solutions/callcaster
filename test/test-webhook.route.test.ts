import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    testWebhook: vi.fn(),
    verifyAuth: vi.fn(),
    assertSafeOutboundUrl: vi.fn(),
    logger: { warn: vi.fn() },
  };
});

vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  testWebhook: (...args: any[]) => mocks.testWebhook(...args),
}));
vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
// The real guard does live DNS resolution — never in unit tests.
vi.mock("@/lib/safe-outbound-url.server", () => ({
  assertSafeOutboundUrl: (...args: any[]) => mocks.assertSafeOutboundUrl(...args),
}));

describe("app/routes/api+/test-webhook/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.testWebhook.mockReset();
    mocks.logger.warn.mockReset();
    mocks.assertSafeOutboundUrl.mockReset();
    mocks.assertSafeOutboundUrl.mockResolvedValue(new URL("http://hook"));
    setDualAuthSession({ user: { id: "u1" } });
  });

  test("returns 400 on invalid input (event not object or destination_url not string)", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      event: JSON.stringify("nope"),
      destination_url: 123,
      custom_headers: JSON.stringify([]),
    });
    const mod = await import("../app/routes/api+/test-webhook");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input" });
    expect(mocks.logger.warn).toHaveBeenCalledWith("Invalid input for webhook test");
  });

  test("returns 400 and skips the webhook when the destination URL is blocked", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      event: JSON.stringify({ category: "outbound_sms" }),
      destination_url: "http://169.254.169.254/latest",
      custom_headers: JSON.stringify([]),
    });
    mocks.assertSafeOutboundUrl.mockRejectedValueOnce(
      new Error("Destination URL host is not allowed"),
    );
    const mod = await import("../app/routes/api+/test-webhook");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Destination URL host is not allowed",
    });
    expect(mocks.testWebhook).not.toHaveBeenCalled();
  });

  test("parses headers and returns testWebhook result", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      event: JSON.stringify({ category: "outbound_sms" }),
      destination_url: "http://hook",
      custom_headers: JSON.stringify([["X-Test", "1"]]),
    });
    mocks.testWebhook.mockResolvedValueOnce({ ok: true });
    const mod = await import("../app/routes/api+/test-webhook");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.testWebhook).toHaveBeenCalledWith({ category: "outbound_sms" }, "http://hook", { "X-Test": "1" });
  });
});
