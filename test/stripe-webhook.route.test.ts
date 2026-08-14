import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const transactionHistoryMock = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(async () => ({ inserted: true, existingId: 1 })),
}));

const stripeMock = vi.hoisted(() => ({
  webhooks: {
    constructEvent: vi.fn(),
  },
}));

const envState = vi.hoisted(() => ({ webhookSecret: "" }));

vi.mock("@/lib/env.server", () => ({
  env: {
    STRIPE_SECRET_KEY: () => "sk_test",
    STRIPE_WEBHOOK_SECRET: () => envState.webhookSecret,
    BETTER_AUTH_URL: () => "http://adminDb.test",
    BETTER_AUTH_SERVICE_KEY: () => "service-key",
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) =>
    transactionHistoryMock.insertTransactionHistoryIdempotent(...args),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = stripeMock.webhooks;
    constructor(..._args: unknown[]) {}
  },
}));

describe("app/routes/api+/stripe-webhook/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    envState.webhookSecret = "";
    transactionHistoryMock.insertTransactionHistoryIdempotent.mockReset();
    stripeMock.webhooks.constructEvent.mockReset();
  });

  test("returns 503 when webhook secret is not configured", async () => {
    const mod = await import("../app/routes/api+/stripe-webhook");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/stripe-webhook", {
          method: "POST",
          body: "{}",
        }),
      } as never),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("not configured");
  });

  test("credits workspace once using stripeSessionKey(session.id) when complete and paid", async () => {
    envState.webhookSecret = "whsec";
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "session_123",
          status: "complete",
          payment_status: "paid",
          metadata: { workspaceId: "w1", creditAmount: "10" },
        },
      },
    });

    const mod = await import("../app/routes/api+/stripe-webhook");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/stripe-webhook", {
          method: "POST",
          headers: { "Stripe-Signature": "sig" },
          body: "{}",
        }),
      } as never),
    );

    expect(response.status).toBe(200);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "w1",
        amount: 10,
        idempotencyKey: "stripe_session:session_123",
      }),
    );
  });

  test("does not credit when session status is not complete", async () => {
    envState.webhookSecret = "whsec";
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_open",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "session_open",
          status: "open",
          payment_status: "unpaid",
          metadata: { workspaceId: "w1", creditAmount: "10" },
        },
      },
    });

    const mod = await import("../app/routes/api+/stripe-webhook");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/stripe-webhook", {
          method: "POST",
          headers: { "Stripe-Signature": "sig" },
          body: "{}",
        }),
      } as never),
    );

    expect(response.status).toBe(200);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("does not credit when payment_status is not paid", async () => {
    envState.webhookSecret = "whsec";
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "session_unpaid",
          status: "complete",
          payment_status: "unpaid",
          metadata: { workspaceId: "w1", creditAmount: "10" },
        },
      },
    });

    const mod = await import("../app/routes/api+/stripe-webhook");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/stripe-webhook", {
          method: "POST",
          headers: { "Stripe-Signature": "sig" },
          body: "{}",
        }),
      } as never),
    );

    expect(response.status).toBe(200);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });
});
