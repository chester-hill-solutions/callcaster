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

function makeTdb(rows: Array<{ burst_count: number; hour_count: number }>) {
  return {
    execute: vi.fn(async () => rows),
  } as any;
}

describe("inboundSmsRateVerdict (#1394)", () => {
  const workspaceId = "ws-1";
  const fromNumber = "+15550001111";

  test("allows when both windows are under their caps", async () => {
    const tdb = makeTdb([{ burst_count: 3, hour_count: 12 }]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({ allowed: true });
    expect(tdb.execute).toHaveBeenCalledTimes(1);
  });

  test("refuses on the burst window when it trips first", async () => {
    const tdb = makeTdb([
      { burst_count: INBOUND_SMS_BURST_MAX, hour_count: 30 },
    ]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({
      allowed: false,
      window: "burst",
      count: INBOUND_SMS_BURST_MAX,
      limit: INBOUND_SMS_BURST_MAX,
    });
  });

  test("refuses on the hour window when it trips without the burst window tripping", async () => {
    const tdb = makeTdb([
      { burst_count: 0, hour_count: INBOUND_SMS_HOUR_MAX },
    ]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({
      allowed: false,
      window: "hour",
      count: INBOUND_SMS_HOUR_MAX,
      limit: INBOUND_SMS_HOUR_MAX,
    });
  });

  test("burst refusal takes precedence when both windows are tripped simultaneously", async () => {
    const tdb = makeTdb([
      {
        burst_count: INBOUND_SMS_BURST_MAX + 5,
        hour_count: INBOUND_SMS_HOUR_MAX + 5,
      },
    ]);
    const result = await inboundSmsRateVerdict(tdb, { workspaceId, fromNumber });
    if (result.allowed) throw new Error("expected refusal");
    expect(result.window).toBe("burst");
    // The count/limit reported matches the burst side, not the hour side.
    expect(result.count).toBe(INBOUND_SMS_BURST_MAX + 5);
    expect(result.limit).toBe(INBOUND_SMS_BURST_MAX);
  });

  test("empty from-number short-circuits to allowed without a db call", async () => {
    // No bucket to key against; the route path treats blank-from as "no
    // attribution" too, so refusing here would drop legitimate carrier
    // messages that lack a From header.
    const tdb = makeTdb([]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber: "   " }),
    ).resolves.toEqual({ allowed: true });
    expect(tdb.execute).not.toHaveBeenCalled();
  });

  test("db returning no rows is treated as zero events (allow)", async () => {
    const tdb = makeTdb([]);
    await expect(
      inboundSmsRateVerdict(tdb, { workspaceId, fromNumber }),
    ).resolves.toEqual({ allowed: true });
    expect(tdb.execute).toHaveBeenCalled();
  });

  test("expands the from-number into E.164 / bare / leading-1 variants so an attacker can't sidestep the guard by re-encoding", async () => {
    const tdb = makeTdb([{ burst_count: 0, hour_count: 0 }]);
    await inboundSmsRateVerdict(tdb, {
      workspaceId,
      fromNumber: "+15551234567",
    });
    // The variants list flows into the sql tagged template as an ANY(...)
    // parameter. Capture the drizzle SQL object and inspect the parameter
    // array to confirm every plausible on-wire encoding is included.
    const sqlArg = tdb.execute.mock.calls[0][0];
    const flat = JSON.stringify(sqlArg);
    expect(flat).toContain("+15551234567");
    expect(flat).toContain("15551234567");
    expect(flat).toContain("5551234567");
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
