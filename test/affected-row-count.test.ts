import { describe, expect, test } from "vitest";

import { affectedRowCount } from "@/lib/worker/poll-jobs.server";

/**
 * #2893: the worker connects with postgres.js, so `db.execute()` resolves to a
 * `Result` that IS an Array and carries the affected-row count on `count`. An
 * UPDATE without RETURNING is therefore an empty array with a non-zero count.
 *
 * The helper used to test `Array.isArray` first and return the length, so every
 * write read as "changed nothing" and the stale-claim and dead-letter alerts
 * could never fire.
 */
function postgresJsResult(count: number): unknown {
  // Same shape as postgres.js: an Array subclass with `count` on it.
  const rows: unknown[] = [];
  Object.defineProperty(rows, "count", { value: count, enumerable: false });
  return rows;
}

describe("affectedRowCount (#2893)", () => {
  test("reads the driver's count on an empty array", () => {
    expect(affectedRowCount(postgresJsResult(3))).toBe(3);
  });

  test("a zero count still means nothing changed", () => {
    expect(affectedRowCount(postgresJsResult(0))).toBe(0);
  });

  test("falls back to the array length for plain rows", () => {
    expect(affectedRowCount([{ id: 1 }, { id: 2 }])).toBe(2);
  });

  test("anything else counts as nothing", () => {
    expect(affectedRowCount(null)).toBe(0);
    expect(affectedRowCount(undefined)).toBe(0);
    expect(affectedRowCount("nope")).toBe(0);
  });
});
