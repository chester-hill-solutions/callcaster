import { describe, expect, test, vi } from "vitest";
import {
  canTransitionOutreachDisposition,
  getCallWithRetry,
} from "../shared/ivr-status-logic.ts";

describe("ivr-status shared logic", () => {

  test("canTransitionOutreachDisposition blocks terminal -> different", () => {
    expect(canTransitionOutreachDisposition("completed", "busy")).toBe(false);
    expect(canTransitionOutreachDisposition("voicemail", "completed")).toBe(false);
    expect(canTransitionOutreachDisposition("in-progress", "completed")).toBe(true);
    expect(canTransitionOutreachDisposition(null, "completed")).toBe(true);
  });

  test("getCallWithRetry retries then succeeds", async () => {
    let attempt = 0;
    const client: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              attempt++;
              if (attempt < 3) return { data: null, error: new Error("no row") };
              return { data: { sid: "CA1" }, error: null };
            },
          }),
        }),
      }),
    };

    const sleep = vi.fn(async () => undefined);
    const res = await getCallWithRetry(client, "CA1", {
      maxRetries: 5,
      retryDelayMs: 1,
      sleep,
    });
    expect(res).toMatchObject({ sid: "CA1" });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

});
