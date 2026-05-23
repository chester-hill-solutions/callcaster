import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE,
  buildDueDateForMonth,
  formatDateIsoUtc,
  formatCycleKey,
  getRelevantDueDates,
  parseIsoDate,
  isAtOrAfterRolloutStart,
  resolveNotificationWindow,
} from "../_shared/number-rental-billing.ts";

Deno.test("buildDueDateForMonth uses month-end fallback for 31st anchor", () => {
  const anchor = parseIsoDate("2024-01-31T12:00:00.000Z");
  const aprilDue = buildDueDateForMonth({
    anchorDate: anchor,
    year: 2024,
    monthIndex: 3,
  });
  const febLeapDue = buildDueDateForMonth({
    anchorDate: anchor,
    year: 2024,
    monthIndex: 1,
  });
  const febNonLeapDue = buildDueDateForMonth({
    anchorDate: anchor,
    year: 2025,
    monthIndex: 1,
  });

  assertEquals(formatDateIsoUtc(aprilDue), "2024-04-30");
  assertEquals(formatDateIsoUtc(febLeapDue), "2024-02-29");
  assertEquals(formatDateIsoUtc(febNonLeapDue), "2025-02-28");
});

Deno.test("resolveNotificationWindow matches configured offsets", () => {
  const dueDate = parseIsoDate("2026-05-31T00:00:00.000Z");
  assertEquals(
    resolveNotificationWindow(parseIsoDate("2026-05-06T00:00:00.000Z"), dueDate),
    "pre25",
  );
  assertEquals(
    resolveNotificationWindow(parseIsoDate("2026-05-16T00:00:00.000Z"), dueDate),
    "pre15",
  );
  assertEquals(
    resolveNotificationWindow(parseIsoDate("2026-05-28T00:00:00.000Z"), dueDate),
    "pre3",
  );
  assertEquals(
    resolveNotificationWindow(parseIsoDate("2026-06-30T00:00:00.000Z"), dueDate),
    "post30",
  );
  assertEquals(
    resolveNotificationWindow(parseIsoDate("2026-05-27T00:00:00.000Z"), dueDate),
    null,
  );
});

Deno.test("getRelevantDueDates returns current and previous due dates", () => {
  const anchor = parseIsoDate("2025-01-31T14:12:00.000Z");
  const now = parseIsoDate("2026-04-01T00:00:00.000Z");
  const dueDates = getRelevantDueDates(anchor, now);

  assertEquals(dueDates.length, 2);
  assertEquals(formatDateIsoUtc(dueDates[0]), "2026-04-30");
  assertEquals(formatCycleKey(dueDates[0]), "2026-04");
  assertEquals(formatDateIsoUtc(dueDates[1]), "2026-03-31");
  assertEquals(formatCycleKey(dueDates[1]), "2026-03");
});

Deno.test("parseIsoDate throws on invalid input", () => {
  assertThrows(() => parseIsoDate("not-a-date"));
});

Deno.test("rollout start gate only includes numbers from 2026-04-01 onward", () => {
  assertEquals(NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE, "2026-04-01");
  assertEquals(
    isAtOrAfterRolloutStart(parseIsoDate("2026-03-31T23:59:59.000Z")),
    false,
  );
  assertEquals(
    isAtOrAfterRolloutStart(parseIsoDate("2026-04-01T00:00:00.000Z")),
    true,
  );
});
