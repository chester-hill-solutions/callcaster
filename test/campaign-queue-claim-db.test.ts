import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The in-flight claim guard (#2208).
 *
 * The defect this pins: a campaign split moves a contact whose SMS is already
 * at Twilio into a new segment, because the row stays `queued` until after the
 * provider call returns. The contact then receives two texts.
 *
 * The two halves are load-bearing together. A claim the split ignores is
 * useless; a split that holds rows back is useless without a claim to hold
 * back. The split side is covered against a real database in
 * test/integration-db/split-campaign-inflight-claim.test.ts; this file pins
 * the write's two defining properties — it reports the race, and it does not
 * change the row's lifecycle.
 */

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({ campaign_queue: { update: mocks.update } }),
}));

/** Rows the conditional UPDATE reports as claimed. */
let updateReturning: Array<{ id: number }> = [];
/** Every SET payload handed to the update. */
let setPayloads: Array<Record<string, unknown>> = [];
/** Every WHERE payload handed to the update. */
let wherePayloads: unknown[] = [];

beforeEach(() => {
  updateReturning = [];
  setPayloads = [];
  wherePayloads = [];
  mocks.update.mockReset();
  mocks.update.mockImplementation((opts: any) => {
    setPayloads.push(opts.set);
    wherePayloads.push(opts.where);
    return Promise.resolve(updateReturning);
  });
});

async function claim(queueId: number) {
  const { claimQueueEntryForSms } = await import(
    "@/lib/campaign-queue-claim.server"
  );
  return claimQueueEntryForSms({ queueId, workspaceId: "w1" });
}

describe("claimQueueEntryForSms (#2208)", () => {
  test("reports success when the conditional update claimed the row", async () => {
    updateReturning = [{ id: 7 }];
    await expect(claim(7)).resolves.toBe(true);
  });

  // The kill-check for the whole fix. If this returned true, a second
  // dispatcher would send to a contact already in flight at Twilio, and the
  // split-side guard would be protecting a marker nobody honours.
  test("reports failure when another dispatcher already holds the row", async () => {
    updateReturning = [];
    await expect(claim(7)).resolves.toBe(false);
  });

  test("stamps claimed_at on the row it wins", async () => {
    const before = Date.now();
    updateReturning = [{ id: 7 }];
    await claim(7);
    const after = Date.now();

    // A real `Date`. The column is `timestamptz` and the model says so
    // (#2213), so the lease is written as a timestamp rather than as an ISO
    // string the database has to coerce. This test used to assert
    // `typeof === "string"`, which pinned the pre-#2213 workaround in place.
    const stamped = setPayloads[0]?.claimed_at;
    expect(stamped).toBeInstanceOf(Date);
    const stampedMs = (stamped as Date).getTime();
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(after);
  });

  // A claim must not change the row's lifecycle state. If it did, the
  // dequeue-after-send crash-safety the SMS path depends on would break in the
  // other direction: a crashed dispatcher's row would look completed and never
  // retry.
  test("does not touch queue_state — the marker is not a lifecycle change", async () => {
    updateReturning = [{ id: 7 }];
    await claim(7);
    expect(setPayloads[0]).not.toHaveProperty("queue_state");
    expect(setPayloads[0]).not.toHaveProperty("dequeued_at");
  });

  // The row identity and the "still queued" guard are the whole WHERE clause.
  // Without the id predicate this would claim every queued row in the
  // workspace, so the predicate is asserted rather than trusted.
  test("scopes the write to one row id", async () => {
    updateReturning = [{ id: 7 }];
    await claim(4242);
    const rendered = JSON.stringify(
      wherePayloads[0],
      (_k, v) => (v && v.name ? `<col ${String(v.name)}>` : v),
    );
    expect(rendered).toContain("col id");
    expect(rendered).toContain("4242");
  });
});
