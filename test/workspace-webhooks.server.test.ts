import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceWebhookRow: vi.fn(),
  safeOutboundFetch: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceWebhookRow: (...args: unknown[]) => mocks.getWorkspaceWebhookRow(...args),
}));

vi.mock("@/lib/safe-outbound-url.server", () => ({
  safeOutboundFetch: (...args: unknown[]) => mocks.safeOutboundFetch(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

describe("sendWorkspaceWebhookNotification", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getWorkspaceWebhookRow.mockReset();
    mocks.safeOutboundFetch.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
  });

  test("blocks SSRF destinations via safeOutboundFetch", async () => {
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "http://169.254.169.254/latest/meta-data",
      custom_headers: {},
      events: [{ category: "message", type: "INSERT" }],
    });
    mocks.safeOutboundFetch.mockRejectedValueOnce(
      new Error("Destination URL host is not allowed"),
    );

    const { sendWorkspaceWebhookNotification } = await import(
      "../app/lib/workspace-webhooks.server"
    );

    const result = await sendWorkspaceWebhookNotification({
      eventCategory: "message",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { id: 1 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
    expect(mocks.safeOutboundFetch).toHaveBeenCalledWith(
      "http://169.254.169.254/latest/meta-data",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("delivers webhook payload when destination is safe", async () => {
    mocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      destination_url: "https://hooks.example.com/callback",
      custom_headers: { "X-Custom": "1" },
      events: [{ category: "message", type: "INSERT" }],
    });
    mocks.safeOutboundFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { sendWorkspaceWebhookNotification } = await import(
      "../app/lib/workspace-webhooks.server"
    );

    const result = await sendWorkspaceWebhookNotification({
      eventCategory: "message",
      eventType: "INSERT",
      workspaceId: "w1",
      payload: { id: 1 },
    });

    expect(result).toEqual({ success: true, error: null });
    expect(mocks.safeOutboundFetch).toHaveBeenCalledWith(
      "https://hooks.example.com/callback",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom": "1",
        }),
        body: expect.stringContaining('"event_category":"message"'),
      }),
    );
  });
});
