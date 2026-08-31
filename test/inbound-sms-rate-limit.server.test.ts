import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// expandPhoneMatchVariants pulls in the drizzle schema; keep the real impl.
import {
  inboundSmsRateVerdict,
  INBOUND_SMS_BURST_MAX,
  INBOUND_SMS_BURST_WINDOW_MS,
  INBOUND_SMS_HOUR_MAX,
  INBOUND_SMS_HOUR_WINDOW_MS,
} from "@/lib/inbound-sms-rate-limit.server";
import { expandPhoneMatchVariants } from "@/lib/message-db.server";

/**
 * The implementation issues burst first, then (only when burst is under
 * cap) the hour query. Tests feed the counts as a two-element queue so
 * we can assert the short-circuit path too.
 */
function makeTdb(counts: number[]) {
  const queue = [...counts];
  const count = vi.fn(async () => {
    if (!queue.length) throw new Error("unexpected extra count() call");
    return queue.shift() as number;
  });
  return {
    tdb: {
      message: { count },
    } as any,
    count,
  };
}

describe("inboundSmsRateVerdict (#1394)", () => {
  const workspaceId = "ws-1";
  const fromNumber = "+15550001111";

  test("allows when both windows are under their caps", async () => {
    const { tdb, count } = makeTdb([3, 12]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({ allowed: true });
    expect(count).toHaveBeenCalledTimes(2);
  });

  test("refuses on the burst window when it trips first and short-circuits the hour query", async () => {
    const { tdb, count } = makeTdb([INBOUND_SMS_BURST_MAX]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({
      allowed: false,
      window: "burst",
      count: INBOUND_SMS_BURST_MAX,
      limit: INBOUND_SMS_BURST_MAX,
    });
    expect(count).toHaveBeenCalledTimes(1);
  });

  test("refuses on the hour window when it trips without the burst window tripping", async () => {
    const { tdb, count } = makeTdb([0, INBOUND_SMS_HOUR_MAX]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({
      allowed: false,
      window: "hour",
      count: INBOUND_SMS_HOUR_MAX,
      limit: INBOUND_SMS_HOUR_MAX,
    });
    expect(count).toHaveBeenCalledTimes(2);
  });

  test("burst refusal takes precedence when the burst window itself trips (hour query never runs)", async () => {
    const { tdb } = makeTdb([INBOUND_SMS_BURST_MAX + 5]);
    const result = await inboundSmsRateVerdict(tdb, { workspaceId, fromNumber });
    if (result.allowed) throw new Error("expected refusal");
    expect(result.window).toBe("burst");
    expect(result.count).toBe(INBOUND_SMS_BURST_MAX + 5);
    expect(result.limit).toBe(INBOUND_SMS_BURST_MAX);
  });

  test("empty from-number short-circuits to allowed without a db call", async () => {
    // No bucket to key against; the route path treats blank-from as "no
    // attribution" too, so refusing here would drop legitimate carrier
    // messages that lack a From header.
    const { tdb, count } = makeTdb([]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber: "   " }),
    ).resolves.toEqual({ allowed: true });
    expect(count).not.toHaveBeenCalled();
  });

  test("zero counts allow the message through", async () => {
    const { tdb, count } = makeTdb([0, 0]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({ allowed: true });
    expect(count).toHaveBeenCalledTimes(2);
  });

  test("expands the from-number into E.164 / bare / leading-1 variants so an attacker can't sidestep the guard by re-encoding", async () => {
    // Contract check: whatever the guard passes to `inArray(from, …)` must
    // include every plausible on-wire encoding — otherwise an attacker
    // swapping "+15551234567" for "15551234567" mid-stream would reset
    // both counters. Assert against expandPhoneMatchVariants directly
    // (walking the drizzle where AST hits circular refs on PgTable).
    const variants = expandPhoneMatchVariants("+15551234567");
    expect(variants).toEqual(expect.arrayContaining([
      "+15551234567",
      "15551234567",
      "5551234567",
    ]));

    const { tdb, count } = makeTdb([0, 0]);
    await inboundSmsRateVerdict(tdb, {
      workspaceId,
      fromNumber: "+15551234567",
    });
    expect(count).toHaveBeenCalled();
  });

  test("thresholds are exported so the route + tests reference the same constants", () => {
    // A refactor that flipped these to per-call literals would silently
    // desync the module from the tests; pin the exports.
    expect(INBOUND_SMS_BURST_WINDOW_MS).toBe(60_000);
    expect(INBOUND_SMS_HOUR_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(INBOUND_SMS_BURST_MAX).toBeGreaterThan(0);
    expect(INBOUND_SMS_HOUR_MAX).toBeGreaterThan(INBOUND_SMS_BURST_MAX);
  });
});
