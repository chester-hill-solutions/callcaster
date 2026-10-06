export const NUMBER_RENTAL_ROLLOUT_CUTOFF_DATE = "2026-04-01";

export function numberRentalDueDate(
  anchorDate: string,
  targetDate: Date,
): Date {
  const anchor = new Date(anchorDate);
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay)),
  );
}

export function numberRentalReconciliationPeriod(referenceDate: Date) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1))
      .toISOString()
      .slice(0, 10),
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}
