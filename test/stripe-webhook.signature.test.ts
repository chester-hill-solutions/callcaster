import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type Stripe from "stripe";

import { asRouteResponse } from "./helpers/route-result";

/**
 * Regression test for #1473.
 *
 * The `stripe` package's export map has a `bun` condition that resolves to the
 * worker build, whose default crypto provider is `SubtleCryptoProvider`.
 * That provider is async-only, so the synchronous `constructEvent` throws
 * "SubtleCryptoProvider cannot be used in a synchronous context" and every
 * production webhook was rejected. This suite loads that same worker build
 * (vitest runs on Node, which would otherwise pick the Node build with a
 * sync-capable provider) and drives the handler with a genuinely signed
 * payload, so the async verification path is exercised under the provider
 * production uses.
 */

const WORKER_BUILD = fileURLToPath(
  new URL("../node_modules/stripe/cjs/stripe.cjs.worker.js", import.meta.url),
);

const WEBHOOK_SECRET = "whsec_test_1473";

const transactionHistoryMock = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(async () => ({ inserted: true, existingId: 1 })),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    STRIPE_SECRET_KEY: () => "sk_test",
    STRIPE_WEBHOOK_SECRET: () => "whsec_test_1473",
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

vi.mock("stripe", async () => {
  const worker = await vi.importActual<{ default: typeof Stripe }>(WORKER_BUILD);
  return { default: worker.default };
});

async function loadWorkerStripe(): Promise<Stripe> {
  const mod = await import("stripe");
  return new mod.default("sk_test", { apiVersion: "2024-06-20" });
}

function checkoutSessionCompleted(sessionId: string): string {
  return JSON.stringify({
    id: `evt_${sessionId}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        status: "complete",
        payment_status: "paid",
        metadata: { workspaceId: "w1", creditAmount: "10" },
      },
    },
  });
}

async function postWebhook(payload: string, signature: string) {
  const mod = await import("../app/routes/api+/stripe-webhook");
  return asRouteResponse(
    mod.action({
      request: new Request("http://localhost/api/stripe-webhook", {
        method: "POST",
        headers: { "Stripe-Signature": signature },
        body: payload,
      }),
    } as never),
  );
}

describe("stripe webhook signature verification under the worker (SubtleCrypto) build", () => {
  beforeEach(() => {
    vi.resetModules();
    transactionHistoryMock.insertTransactionHistoryIdempotent.mockReset();
    transactionHistoryMock.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: true,
      existingId: 1,
    });
  });

  test("harness reproduces production: sync constructEvent throws under SubtleCryptoProvider", async () => {
    const stripe = await loadWorkerStripe();
    const payload = checkoutSessionCompleted("cs_sanity");
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: WEBHOOK_SECRET,
    });

    expect(() => stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET)).toThrow(
      /SubtleCryptoProvider cannot be used in a synchronous context/,
    );
  });

  test("accepts a correctly signed payload and credits the workspace", async () => {
    const stripe = await loadWorkerStripe();
    const payload = checkoutSessionCompleted("cs_signed");
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: WEBHOOK_SECRET,
    });

    const response = await postWebhook(payload, header);

    expect(response.status).toBe(200);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "w1",
        amount: 10,
        idempotencyKey: "stripe_session:cs_signed",
      }),
    );
  });

  test("rejects a payload signed with the wrong secret with 400 and credits nothing", async () => {
    const stripe = await loadWorkerStripe();
    const payload = checkoutSessionCompleted("cs_forged");
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: "whsec_wrong",
    });

    const response = await postWebhook(payload, header);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("signature verification failed");
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("rejects a payload that was altered after signing", async () => {
    const stripe = await loadWorkerStripe();
    const payload = checkoutSessionCompleted("cs_tampered");
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: WEBHOOK_SECRET,
    });

    const response = await postWebhook(payload.replace('"creditAmount":"10"', '"creditAmount":"9999"'), header);

    expect(response.status).toBe(400);
    expect(transactionHistoryMock.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });
});
