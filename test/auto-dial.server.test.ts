import { beforeEach, describe, expect, test, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  BASE_URL: vi.fn(() => "https://example.test"),
}));

vi.mock("@/lib/env.server", () => ({ env: envMock }));
vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  normalizePhoneNumber,
  saveCallToDatabase,
} from "../app/lib/auto-dial.server";

describe("auto-dial.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("normalizePhoneNumber re-exports shared helper", () => {
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("+15551234567");
  });

  test("getNextAutoDialQueueContact returns first record", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [{ queue_id: 1 }], error: null }),
    };
    const result = await getNextAutoDialQueueContact(supabase as never, 1, "user-1");
    expect(result).toEqual({ queue_id: 1 });
  });

  test("getNextAutoDialQueueContact returns null when empty", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    expect(await getNextAutoDialQueueContact(supabase as never, 1, "user-1")).toBeNull();
  });

  test("getNextAutoDialQueueContact throws on rpc error", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc fail") }),
    };
    await expect(
      getNextAutoDialQueueContact(supabase as never, 1, "user-1"),
    ).rejects.toThrow("rpc fail");
  });

  test("createOutreachAttempt calls rpc and returns data", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: { id: 9 }, error: null }),
    };
    const result = await createOutreachAttempt(
      supabase as never,
      { queue_id: 1, contact_id: 2, contact_phone: "+15551234567" },
      3,
      "ws-1",
      "user-1",
    );
    expect(result).toEqual({ id: 9 });
  });

  test("createTwilioCall uses BASE_URL callbacks", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "CA123" });
    const client = { calls: { create } };
    await createTwilioCall(
      client as never,
      "+15551234567",
      "+15557654321",
      "user-1",
      "device-1",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551234567",
        from: "+15557654321",
        url: "https://example.test/api/auto-dial/user-1",
        statusCallback: "https://example.test/api/auto-dial/status",
      }),
    );
  });

  test("saveCallToDatabase skips when sid missing", async () => {
    const upsert = vi.fn();
    const supabase = { from: vi.fn(() => ({ upsert, select: vi.fn() })) };
    await saveCallToDatabase(supabase as never, {});
    expect(upsert).not.toHaveBeenCalled();
  });

  test("saveCallToDatabase upserts call row", async () => {
    const select = vi.fn().mockResolvedValue({ error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const supabase = { from: vi.fn(() => ({ upsert, select })) };
    await saveCallToDatabase(supabase as never, {
      sid: "CA123",
      status: "completed",
      campaign_id: 1,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA123", campaign_id: 1 }),
    );
  });

  test("completeAllConferences completes in-progress conferences", async () => {
    const update = vi.fn();
    const client = {
      conferences: Object.assign(
        vi.fn(() => ({ update })),
        {
          list: vi.fn().mockResolvedValue([{ sid: "CF1" }, { sid: "CF2" }]),
        },
      ),
    };
    await completeAllConferences(client as never, "user-1");
    expect(update).toHaveBeenCalledTimes(2);
  });
});
