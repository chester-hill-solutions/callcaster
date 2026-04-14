export const RENTED_NUMBER_MONTHLY_CREDITS = 1000;
export const NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE = "2026-04-01";

export type NotificationWindowKey = "pre25" | "pre15" | "pre3" | "post30";

export function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
}

export function isAtOrAfterRolloutStart(anchorDate: Date): boolean {
  return formatDateIsoUtc(utcDayStart(anchorDate)) >= NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE;
}

export function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function formatCycleKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function lastDayOfUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function buildDueDateForMonth(args: {
  anchorDate: Date;
  year: number;
  monthIndex: number;
}): Date {
  const anchorDay = args.anchorDate.getUTCDate();
  const day = Math.min(
    anchorDay,
    lastDayOfUtcMonth(args.year, args.monthIndex),
  );
  return new Date(Date.UTC(args.year, args.monthIndex, day));
}

export function dayDiffUtc(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (utcDayStart(to).getTime() - utcDayStart(from).getTime()) / msPerDay,
  );
}

export function resolveNotificationWindow(
  now: Date,
  dueDate: Date,
): NotificationWindowKey | null {
  const daysFromDue = dayDiffUtc(dueDate, now);
  switch (daysFromDue) {
    case -25:
      return "pre25";
    case -15:
      return "pre15";
    case -3:
      return "pre3";
    case 30:
      return "post30";
    default:
      return null;
  }
}

export function getRelevantDueDates(anchorDate: Date, now: Date): Date[] {
  const currentMonthDue = buildDueDateForMonth({
    anchorDate,
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(),
  });
  const prevMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const previousMonthDue = buildDueDateForMonth({
    anchorDate,
    year: prevMonthDate.getUTCFullYear(),
    monthIndex: prevMonthDate.getUTCMonth(),
  });
  return [currentMonthDue, previousMonthDue];
}

export function formatDateIsoUtc(date: Date): string {
  return utcDayStart(date).toISOString().slice(0, 10);
}
