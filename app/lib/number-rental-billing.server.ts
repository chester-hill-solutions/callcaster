import { eq, and, gte } from "drizzle-orm";
import { workspace_number as workspaceNumberTable, workspace as workspaceTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { numberRentalCycleKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import { logger } from "@/lib/logger.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";

const NUMBER_RENTAL_MONTHLY_CREDITS = 100;
const ROLLOUT_CUTOFF_DATE = "2026-04-01";

function getCycleKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDueDate(anchorDate: string, targetDate: Date): Date {
  const anchor = new Date(anchorDate);
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth();

  // Month-end fallback: if anchor is 31st, Feb 28/29, etc.
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchor.getUTCDate(), lastDayOfMonth);

  return new Date(Date.UTC(year, month, day));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Daily sweep for number rental billing.
 * Called by pg_cron or admin action.
 */
export async function runNumberRentalBilling(args: {
  workspaceId?: string;
  today?: Date;
}): Promise<{
  ok: true;
  processed: number;
  charged: number;
  released: number;
  remindersSent: number;
}> {
  const today = args.today ?? new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Find all rented numbers created after rollout cutoff
  const tdb = args.workspaceId
    ? createTenantDb(args.workspaceId)
    : null;

  // If workspaceId is provided, scope to that workspace; otherwise we'd need
  // a global query (not supported by TenantDb). For now, assume per-workspace
  // invocation via cron loop.
  if (!tdb) {
    throw new Error("workspaceId is required for number rental billing");
  }

  const numbers = await tdb.workspace_number.findMany({
    where: and(
      eq(workspaceNumberTable.type, "rented"),
      gte(workspaceNumberTable.created_at, ROLLOUT_CUTOFF_DATE),
    ),
  });

  let charged = 0;
  const released = 0;
  let remindersSent = 0;

  for (const number of numbers) {
    const anchorDate = number.created_at;
    const currentMonthDue = getDueDate(anchorDate, today);

    // Check if today is the due date
    if (!isSameDay(today, currentMonthDue)) {
      // Handle reminder windows
      const daysUntilDue = daysBetween(today, currentMonthDue);
      if ([25, 15, 3].includes(daysUntilDue)) {
        // TODO: Send reminder email via Resend
        remindersSent++;
      }
      continue;
    }

    // Today is the due date — charge or mark unpaid
    const cycleKey = getCycleKey(today);
    const idempotencyKey = numberRentalCycleKey(number.id, cycleKey);

    try {
      await insertTransactionHistoryIdempotent({
        workspaceId: number.workspace,
        type: "DEBIT",
        amount: debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS),
        note: `Monthly rental for ${number.phone_number ?? number.friendly_name ?? number.id}`,
        idempotencyKey,
      });
      charged++;
    } catch (error) {
      // Insufficient credits or other error — leave unpaid for grace handling
      logger.error("Number rental charge failed", {
        numberId: number.id,
        workspaceId: number.workspace,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Check if previous cycle is unpaid and past grace period (+30 days)
    const previousMonthDue = new Date(currentMonthDue);
    previousMonthDue.setUTCMonth(previousMonthDue.getUTCMonth() - 1);
    const previousCycleKey = getCycleKey(previousMonthDue);
    const previousIdempotencyKey = numberRentalCycleKey(number.id, previousCycleKey);

    // TODO: Check if previous cycle was actually unpaid by querying transaction_history
    // For now, skip auto-release logic until we have a reliable unpaid check
  }

  return {
    ok: true,
    processed: numbers.length,
    charged,
    released,
    remindersSent,
  };
}
