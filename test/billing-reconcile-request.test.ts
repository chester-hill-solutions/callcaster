import { describe, expect, test } from "vitest";

import {
  mapWithConcurrency,
  parseBillingReconcileBody,
} from "../shared/billing-reconcile-request.ts";

describe("parseBillingReconcileBody", () => {
  test("defaults when body is empty or invalid", () => {
    expect(parseBillingReconcileBody(null)).toEqual({
      workspaceId: null,
      limit: 100,
      concurrency: 8,
    });
    expect(parseBillingReconcileBody({})).toEqual({
      workspaceId: null,
      limit: 100,
      concurrency: 8,
    });
  });

  test("parses workspaceId and caps limit/concurrency", () => {
    expect(
      parseBillingReconcileBody({
        workspaceId: " ws-1 ",
        limit: 999,
        concurrency: 50,
      }),
    ).toEqual({
      workspaceId: "ws-1",
      limit: 200,
      concurrency: 20,
    });
  });

  test("falls back for invalid numeric fields", () => {
    expect(
      parseBillingReconcileBody({ limit: "nope", concurrency: 0 }),
    ).toEqual({
      workspaceId: null,
      limit: 100,
      concurrency: 8,
    });
  });
});

describe("mapWithConcurrency", () => {
  test("runs mapper in bounded parallel batches", async () => {
    const items = [1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency(items, 2, async (value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
