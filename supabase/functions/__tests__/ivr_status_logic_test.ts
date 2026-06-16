import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  billingUnitsFromDurationSeconds,
  canTransitionOutreachDisposition,
  getCallWithRetry,
} from "../_shared/ivr-status-logic.ts";

Deno.test("billingUnitsFromDurationSeconds uses Option B IVR rates", () => {
  assertEquals(billingUnitsFromDurationSeconds(0), -2);
  assertEquals(billingUnitsFromDurationSeconds(1), -2);
  assertEquals(billingUnitsFromDurationSeconds(60), -2);
  assertEquals(billingUnitsFromDurationSeconds(61), -5);
});

Deno.test("canTransitionOutreachDisposition blocks terminal transitions", () => {
  assertEquals(canTransitionOutreachDisposition("completed", "busy"), false);
  assertEquals(canTransitionOutreachDisposition("voicemail", "completed"), false);
  assertEquals(canTransitionOutreachDisposition("in-progress", "completed"), true);
  assertEquals(canTransitionOutreachDisposition(null, "completed"), true);
});

Deno.test("getCallWithRetry retries then succeeds", async () => {
  let attempt = 0;
  const sleepCalls: number[] = [];
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            attempt++;
            if (attempt < 3) {
              return { data: null, error: new Error("no row") };
            }
            return { data: { sid: "CA1" }, error: null };
          },
        }),
      }),
    }),
  };

  const res = await getCallWithRetry(supabase, "CA1", {
    maxRetries: 5,
    retryDelayMs: 1,
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assertEquals(res, { sid: "CA1" });
  assertEquals(sleepCalls.length, 2);
});
