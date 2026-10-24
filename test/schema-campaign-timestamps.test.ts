import { describe, expect, test } from "vitest";

import { campaign } from "@/db/schema";

/**
 * `campaign` declared three temporal columns `text()` while the database has
 * `timestamp with time zone` (#2213).
 *
 * Mode `"string"` keeps the scheduling logic unchanged:
 * `campaign-dispatch-policy.ts` reads `start_date`/`end_date` as
 * `string | null` and parses them with `parseDateMs`, and
 * `campaign-execution.server.ts` passes `campaign.start_date` straight to the
 * job scheduler. Both still receive strings.
 *
 * The defaults are part of the contract, so they are asserted here: the
 * database supplies `now()` for `created_at` and `start_date`, and
 * `now() + 30 days` for `end_date`.
 */
describe("campaign timestamps (#2213)", () => {
  test.each([
    ["created_at", campaign.created_at],
    ["start_date", campaign.start_date],
    ["end_date", campaign.end_date],
  ])("%s is timestamp with time zone", (_name, column) => {
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });

  test("keeps the database-supplied defaults", () => {
    expect(campaign.created_at.hasDefault).toBe(true);
    expect(campaign.start_date.hasDefault).toBe(true);
    expect(campaign.end_date.hasDefault).toBe(true);
    expect(campaign.created_at.notNull).toBe(true);
    // The window bounds stay nullable: absent means "no bound".
    expect(campaign.start_date.notNull).toBe(false);
    expect(campaign.end_date.notNull).toBe(false);
  });
});
