/**
 * Regression #1225/#1226/#1227: postgres.js returns bigint/numeric columns
 * from raw SQL as STRINGS. RPC wrappers must coerce, or downstream
 * `typeof === "number"` checks silently drop rows — inbound SMS never linked
 * to contacts (STOP opt-outs ignored), campaign result totals concatenated,
 * conversation contact-id matching never ran.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const dbMock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/server/db", () => ({ db: dbMock }));
vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  rpcFindContactByPhone,
  rpcFindContactsByPhones,
  rpcGetCampaignStats,
  rpcGetAudiencesByCampaign,
} from "@/lib/db-rpc.server";

describe("raw-SQL bigint coercion at RPC boundaries", () => {
  beforeEach(() => {
    dbMock.execute.mockReset();
  });

  test("rpcFindContactByPhone coerces string ids to numbers", async () => {
    dbMock.execute.mockResolvedValue([
      { id: "123", phone: "+15550001111" },
      { id: 456, phone: "+15550001111" },
    ]);
    const rows = await rpcFindContactByPhone("w1", "+15550001111");
    expect(rows.map((r) => r.id)).toEqual([123, 456]);
  });

  test("rpcFindContactsByPhones coerces string ids to numbers", async () => {
    dbMock.execute.mockResolvedValue([{ id: "9", phone: "+15550001111" }]);
    const rows = await rpcFindContactsByPhones("w1", ["+15550001111"]);
    expect(rows[0]?.id).toBe(9);
  });

  test("rpcGetCampaignStats coerces bigint count and numeric expected_total", async () => {
    dbMock.execute.mockResolvedValue([
      { disposition: "completed", count: "5", average_call_duration: null, expected_total: "12.5" },
    ]);
    const rows = await rpcGetCampaignStats(dbMock, 42);
    expect(rows[0]?.count).toBe(5);
    expect(rows[0]?.expected_total).toBe(12.5);
    // The exact failure mode: string counts concatenate instead of adding.
    expect(rows.reduce((acc, r) => acc + (r.count as number), 0)).toBe(5);
  });

  test("rpcGetAudiencesByCampaign coerces string audience ids", async () => {
    dbMock.execute.mockResolvedValue([{ id: "7", name: "A" }]);
    const result = await rpcGetAudiencesByCampaign(1);
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.id).toBe(7);
  });

  test("garbage values become null, not NaN", async () => {
    dbMock.execute.mockResolvedValue([{ id: "not-a-number", phone: "+1" }]);
    const rows = await rpcFindContactByPhone("w1", "+1");
    expect(rows[0]?.id).toBeNull();
  });
});

describe("findMatchingContactIds", () => {
  test("returns ids even when the driver hands back strings", async () => {
    vi.resetModules();
    vi.doMock("@/lib/database/contact.server", () => ({
      findPotentialContacts: vi.fn(async () => ({
        data: [{ id: "123" }, { id: "123" }, { id: 456 }],
        error: null,
      })),
    }));
    const { findMatchingContactIds } = await import("@/lib/inbound-sms-context.server");
    const ids = await findMatchingContactIds("w1", "+15550001111");
    expect(ids).toEqual([123, 456]);
  });
});
