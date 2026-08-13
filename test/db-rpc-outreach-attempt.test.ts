/**
 * Regression #1218/#1219: `create_outreach_attempt` RETURNS bigint, and the
 * postgres.js driver hands int8 back as a STRING (it only auto-parses
 * int2/int4/oid/float). The dial route then failed `Number.isFinite("123")`
 * and wrote `call.outreach_attempt_id = NULL`, which silently disabled every
 * disposition writer — so completed calls never appeared in campaign results.
 */
import { describe, expect, test, vi } from "vitest";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import {
  rpcCreateOutreachAttempt,
  rpcReserveCampaignQueueOrderRange,
} from "@/lib/db-rpc.server";

const ATTEMPT_ARGS = {
  contactId: 1,
  campaignId: 2,
  userId: "u1",
  workspaceId: "w1",
  queueId: 3,
};

describe("rpcCreateOutreachAttempt", () => {
  test("coerces a bigint-as-string id to a number", async () => {
    const execute = vi.fn(async (_q: SQL) => [{ id: "123" }]);
    await expect(rpcCreateOutreachAttempt({ execute }, ATTEMPT_ARGS)).resolves.toBe(123);
  });

  test("passes through a numeric id", async () => {
    const execute = vi.fn(async (_q: SQL) => [{ id: 77 }]);
    await expect(rpcCreateOutreachAttempt({ execute }, ATTEMPT_ARGS)).resolves.toBe(77);
  });

  test("throws on a non-numeric id instead of returning garbage", async () => {
    const execute = vi.fn(async (_q: SQL) => [{ id: "not-a-number" }]);
    await expect(rpcCreateOutreachAttempt({ execute }, ATTEMPT_ARGS)).rejects.toThrow(
      /non-numeric/,
    );
  });

  test("throws when no id is returned", async () => {
    const execute = vi.fn(async (_q: SQL) => []);
    await expect(rpcCreateOutreachAttempt({ execute }, ATTEMPT_ARGS)).rejects.toThrow(
      /returned no id/,
    );
  });
});

describe("rpcReserveCampaignQueueOrderRange", () => {
  test("coerces a stringified start order", async () => {
    const execute = vi.fn(async (_q: SQL) => [{ start_order: "40" }]);
    await expect(
      rpcReserveCampaignQueueOrderRange({ execute }, { campaignId: 1, count: 5 }),
    ).resolves.toBe(40);
  });
});
