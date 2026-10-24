import { describe, expect, test } from "vitest";

import { outreach_attempt } from "@/db/schema";

/**
 * `outreach_attempt` declared its three temporal columns `text()` while the
 * database has `timestamp with time zone` (#2213).
 *
 * The mode stays `"string"`, which is what keeps the two places that care about
 * these values working unchanged: `ivr-machine.server.ts` stamps `answered_at`
 * with an ISO string and treats a present value as a connection, and
 * `workspace-analytics.server.ts` types `ended_at` as `string | null`.
 */
describe("outreach attempt timestamps (#2213)", () => {
  test.each([
    ["answered_at", outreach_attempt.answered_at],
    ["created_at", outreach_attempt.created_at],
    ["ended_at", outreach_attempt.ended_at],
  ])("%s is timestamp with time zone", (_name, column) => {
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });

  test("keeps the database default on created_at only", () => {
    expect(outreach_attempt.created_at.hasDefault).toBe(true);
    expect(outreach_attempt.answered_at.hasDefault).toBe(false);
    expect(outreach_attempt.ended_at.hasDefault).toBe(false);
  });
});
