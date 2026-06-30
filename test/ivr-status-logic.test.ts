import { describe, expect, test, vi } from "vitest";
import {
  billingUnitsFromDurationSeconds,
  canTransitionOutreachDisposition,
  checkWorkspaceCredits,
  getCallWithRetry,
} from "../shared/ivr-status-logic.ts";

describe("ivr-status shared logic", () => {
  test("billingUnitsFromDurationSeconds rounds up per started minute", () => {
    expect(billingUnitsFromDurationSeconds(0, "ivr")).toBe(-2);
    expect(billingUnitsFromDurationSeconds(1, "ivr")).toBe(-2);
    expect(billingUnitsFromDurationSeconds(60, "ivr")).toBe(-2);
    expect(billingUnitsFromDurationSeconds(61, "ivr")).toBe(-5);
  });

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

  test("checkWorkspaceCredits disables campaign and cancels call when credits are 0", async () => {
    const updates: any[] = [];
    const client: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 0 }, error: null }),
              }),
            }),
          };
        }
        if (table === "campaign") {
          return {
            update: (patch: any) => ({
              eq: async () => {
                updates.push(patch);
                return { data: null, error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const twilioClient = {
      calls: () => ({
        update: vi.fn(async () => ({})),
      }),
    };

    const ok = await checkWorkspaceCredits({
      client,
      workspaceId: "w1",
      campaignId: "c1",
      callSid: "CA1",
      twilioClient,
    });
    expect(ok).toBe(false);
    expect(updates).toEqual([{ is_active: false }]);
  });
});
