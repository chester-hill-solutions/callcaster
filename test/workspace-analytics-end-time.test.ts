import { describe, expect, it } from "vitest";

import { aggregateAttemptMetrics } from "../shared/workspace-analytics";

/**
 * #2213 made `call.end_time` a real `timestamptz`, so an attempt's end time is
 * read as a `Date` instead of an ISO string — and `AnalyticsAttemptInput` now
 * admits both, because a row read through Drizzle is a `Date` while the same
 * field in a JSON payload is a string.
 *
 * The latest end time used to be picked with a bare `values.sort().at(-1)`.
 * That is safe only while every value is an ISO string, whose lexicographic
 * order happens to be chronological. It is not safe across the union: `sort()`
 * stringifies, an ISO string begins "2026-…" (0x32) and a Date begins with its
 * weekday ("Mon…", 0x4D), so *every* ISO string sorts before *every* Date and
 * `.at(-1)` returns whichever Date happens to be in the list — even when an
 * ISO string is hours later.
 *
 * With no `answered_at`, `dialingSeconds` runs from the attempt's start to that
 * latest end time, so it is the metric that observes the choice.
 */
describe("attempt end time across call rows (#2213)", () => {
  const START = "2026-06-01T10:00:00.000Z";

  const dialingSecondsFor = (endTimes: Array<string | Date | null>) =>
    aggregateAttemptMetrics({
      id: 1,
      user_id: "u1",
      created_at: START,
      answered_at: null,
      ended_at: null,
      disposition: "completed",
      call: endTimes.map((end_time) => ({
        duration: "60",
        call_duration: 60,
        status: "completed",
        end_time,
      })),
    }).dialingSeconds;

  it("picks the latest end time when every value is a Date", () => {
    expect(
      dialingSecondsFor([
        new Date("2026-06-01T09:00:00.000Z"),
        new Date("2026-06-01T11:00:00.000Z"),
        new Date("2026-06-01T10:00:00.000Z"),
      ]),
    ).toBe(3600);
  });

  it("orders Dates the same way it orders ISO strings", () => {
    const ends = [
      "2026-06-01T11:00:00.000Z",
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T10:00:00.000Z",
    ];
    expect(dialingSecondsFor(ends.map((value) => new Date(value)))).toBe(
      dialingSecondsFor(ends),
    );
  });

  // The kill-check. A lexicographic sort ranks "2026-…" before "Mon…", so the
  // bare sort returns the Date at 09:00 and measures two hours instead of one.
  it("prefers a later ISO string over an earlier Date in a mixed list", () => {
    expect(
      dialingSecondsFor([
        "2026-06-01T11:00:00.000Z",
        new Date("2026-06-01T09:00:00.000Z"),
      ]),
    ).toBe(3600);
  });

  it("ignores null end times rather than treating one as the latest", () => {
    expect(
      dialingSecondsFor([null, new Date("2026-06-01T11:00:00.000Z"), null]),
    ).toBe(3600);
  });

  it("reports zero when no call carries an end time", () => {
    expect(dialingSecondsFor([null, null])).toBe(0);
  });
});