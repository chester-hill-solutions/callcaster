import { beforeEach, describe, expect, test, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  BASE_URL: vi.fn(() => "https://example.test"),
}));

vi.mock("@/lib/env.server", () => ({ env: envMock }));
vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const tenantDbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      findFirst: (...args: unknown[]) => tenantDbMocks.findFirst(...args),
      update: (...args: unknown[]) => tenantDbMocks.update(...args),
      insert: (...args: unknown[]) => tenantDbMocks.insert(...args),
    },
  })),
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
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [{ queue_id: 1 }], error: null }),
    };
    const result = await getNextAutoDialQueueContact(client as never, 1, "user-1");
    expect(result).toEqual({ queue_id: 1 });
  });

  test("getNextAutoDialQueueContact returns null when empty", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    expect(await getNextAutoDialQueueContact(client as never, 1, "user-1")).toBeNull();
  });

  test("getNextAutoDialQueueContact throws on rpc error", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc fail") }),
    };
    await expect(
      getNextAutoDialQueueContact(client as never, 1, "user-1"),
    ).rejects.toThrow("rpc fail");
  });

  test("createOutreachAttempt calls rpc and returns data", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { id: 9 }, error: null }),
    };
    const result = await createOutreachAttempt(
      client as never,
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
    await saveCallToDatabase("ws-1", {});
    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
  });

  test("saveCallToDatabase inserts call row when missing", async () => {
    tenantDbMocks.findFirst.mockResolvedValue(null);
    tenantDbMocks.insert.mockResolvedValue([]);
    await saveCallToDatabase("ws-1", {
      sid: "CA123",
      status: "completed",
      campaign_id: 1,
    });
    expect(tenantDbMocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA123", campaign_id: 1 }),
    );
  });

  test("saveCallToDatabase updates call row when existing", async () => {
    tenantDbMocks.findFirst.mockResolvedValue({ sid: "CA123" });
    tenantDbMocks.update.mockResolvedValue([]);
    await saveCallToDatabase("ws-1", {
      sid: "CA123",
      status: "completed",
      campaign_id: 1,
    });
    expect(tenantDbMocks.update).toHaveBeenCalled();
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
