import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  getCallScreenData,
  getInitialCallsList,
  getInitialRecentAttempt,
  getInitialRecentCall,
  getNextRecipient,
  getQueueByDialType,
  getVerifiedNumbers,
} from "../app/lib/call-screen.server";

describe("call-screen.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("getNextRecipient returns null for predictive dial type", () => {
    expect(getNextRecipient([{ id: 1 } as never], "predictive", "user-1")).toBeNull();
  });

  test("getNextRecipient returns first queue item for call dial type", () => {
    const item = { id: 1 } as never;
    expect(getNextRecipient([item], "call", "user-1")).toBe(item);
  });

  test("getNextRecipient returns null for unknown dial type", () => {
    expect(getNextRecipient([], "other", "user-1")).toBeNull();
  });

  test("getInitialCallsList flattens attempt calls", () => {
    expect(
      getInitialCallsList([
        { call: [{ sid: "CA1" }, { sid: "CA2" }] },
        { call: [{ sid: "CA3" }] },
      ] as never),
    ).toEqual([{ sid: "CA1" }, { sid: "CA2" }, { sid: "CA3" }]);
  });

  test("getInitialRecentCall sorts attempts by created_at desc", () => {
    const attempts = [
      { created_at: "2026-01-01T00:00:00.000Z", call: [] },
      { created_at: "2026-03-01T00:00:00.000Z", call: [] },
    ] as never;
    expect(getInitialRecentCall(attempts)?.created_at).toBe("2026-03-01T00:00:00.000Z");
  });

  test("getInitialRecentAttempt sorts attempts by created_at desc", () => {
    const attempts = [
      { created_at: "2026-02-01T00:00:00.000Z" },
      { created_at: "2026-01-01T00:00:00.000Z" },
    ] as never;
    expect(getInitialRecentAttempt(attempts)?.created_at).toBe("2026-02-01T00:00:00.000Z");
  });

  test("getVerifiedNumbers returns verified numbers", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { verified_audio_numbers: ["+15551234567"] },
              error: null,
            }),
          })),
        })),
      })),
    };
    await expect(getVerifiedNumbers(supabase as never, "user-1")).resolves.toEqual([
      "+15551234567",
    ]);
  });

  test("getVerifiedNumbers throws on error", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error("fail") }),
          })),
        })),
      })),
    };
    await expect(getVerifiedNumbers(supabase as never, "user-1")).rejects.toThrow("fail");
  });

  test("getQueueByDialType throws for invalid dial type", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };
    await expect(getQueueByDialType(supabase as never, "1", "invalid", "user-1")).rejects.toThrow(
      "Invalid dial type",
    );
  });

  test("getCallScreenData throws when any query errors", async () => {
    let queueEqCalls = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "campaign_queue") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => {
                queueEqCalls += 1;
                if (queueEqCalls === 1) {
                  return Promise.resolve({ count: 0, error: null });
                }
                return {
                  or: vi.fn().mockResolvedValue({ count: 0, error: null }),
                };
              }),
            })),
          };
        }
        if (table === "outreach_attempt") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
            })),
          })),
        };
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    await expect(getCallScreenData(supabase as never, "1", "ws-1", "user-1")).rejects.toThrow(
      "Error fetching campaign data",
    );
  });

  test("getCallScreenData returns aggregated loader data", async () => {
    const queueSelect = vi
      .fn()
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ count: 10, error: null }),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ count: 4, error: null }),
        }),
      });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "campaign_queue") {
          return { select: queueSelect };
        }
        if (table === "outreach_attempt") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data:
                  table === "workspace"
                    ? { id: "ws-1" }
                    : table === "campaign"
                      ? { id: 1 }
                      : { campaign_id: 1, script: null },
                error: null,
              }),
            })),
          })),
        };
      }),
      rpc: vi.fn().mockResolvedValue({ data: [{ id: "aud-1" }], error: null }),
    };

    const result = await getCallScreenData(supabase as never, "1", "ws-1", "user-1");
    expect(result.workspaceData).toEqual({ id: "ws-1" });
    expect(result.campaign).toEqual({ id: 1 });
    expect(result.audiences).toEqual([{ id: "aud-1" }]);
    expect(result.queueCount).toBe(10);
    expect(result.completedCount).toBe(4);
  });
});
