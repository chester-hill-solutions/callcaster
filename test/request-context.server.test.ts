import { describe, expect, test } from "vitest";
import {
  addRequestIdToJobParams,
  getRequestId,
  runWithRequestContext,
} from "@/lib/request-context.server";

describe("request context", () => {
  test("keeps request ids isolated across concurrent async work", async () => {
    const [first, second] = await Promise.all([
      runWithRequestContext({ requestId: "req-1" }, async () => {
        await Promise.resolve();
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "req-2" }, async () => {
        await Promise.resolve();
        return getRequestId();
      }),
    ]);

    expect(first).toBe("req-1");
    expect(second).toBe("req-2");
    expect(getRequestId()).toBeUndefined();
  });

  test("propagates request ids into job params", () => {
    const params = runWithRequestContext({ requestId: "req-job" }, () =>
      addRequestIdToJobParams({ workspaceId: "ws-1" }),
    );

    expect(params).toEqual({ workspaceId: "ws-1", requestId: "req-job" });
  });
});
