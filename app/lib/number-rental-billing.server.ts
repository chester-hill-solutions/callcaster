import { Resend } from "resend";
import { eq, and, gte } from "drizzle-orm";
import {
  workspace_number as workspaceNumberTable,
  workspace as workspaceTable,
  transaction_history as transactionHistoryTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { numberRentalCycleKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import { logger } from "@/lib/logger.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { listWorkspaceOwnerAdminEmails } from "@/lib/workspace-members-db.server";
import { env } from "@/lib/env.server";

const NUMBER_RENTAL_MONTHLY_CREDITS = 100;
const ROLLOUT_CUTOFF_DATE = "2026-04-01";
const REMINDER_WINDOWS_DAYS = [25, 15, 3];

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

/** Safety bound on catch-up: no rented number should ever accrue this many cycles. */
const MAX_CATCHUP_CYCLES = 36;

/**
 * Every rental due date from the anchor (inclusive — the creation-month cycle
 * is due on the anchor day itself) through `today`. Billing from this list
 * instead of "is today the anchor day?" means a run that was skipped (worker
 * down, deploy gap) charges the missed cycle on the next run rather than
 * leaving it unbilled forever.
 */
function elapsedDueDates(anchorDate: string, today: Date): Date[] {
  const anchor = new Date(anchorDate);
  anchor.setUTCHours(0, 0, 0, 0);
  const dues: Date[] = [];
  const cursor = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1),
  );
  while (dues.length < MAX_CATCHUP_CYCLES) {
    const due = getDueDate(anchorDate, cursor);
    if (due.getTime() > today.getTime()) break;
    if (due.getTime() >= anchor.getTime()) dues.push(due);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dues;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function formatDueDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildReminderEmail(args: {
  phoneNumberLabel: string;
  daysUntilDue: number;
  dueDate: Date;
  workspaceId: string;
}) {
  const billingUrl = `${env.BASE_URL()}/workspaces/${args.workspaceId}/billing`;
  const dueDateLabel = formatDueDate(args.dueDate);
  return {
    subject: `Your CallCaster number rental renews in ${args.daysUntilDue} days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your number rental renews soon</h2>
        <p>The rental for <strong>${args.phoneNumberLabel}</strong> renews in
        <strong>${args.daysUntilDue} days</strong>, on <strong>${dueDateLabel}</strong>, for
        ${NUMBER_RENTAL_MONTHLY_CREDITS} credits.</p>
        <p>Make sure your workspace has enough credits to avoid an unpaid renewal.</p>
        <p><a href="${billingUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review billing</a></p>
      </div>
    `,
    text: `
      Your number rental renews soon

      The rental for ${args.phoneNumberLabel} renews in ${args.daysUntilDue} days, on ${dueDateLabel}, for ${NUMBER_RENTAL_MONTHLY_CREDITS} credits.
      Make sure your workspace has enough credits to avoid an unpaid renewal.

      Review billing: ${billingUrl}
    `,
  };
}

async function sendNumberRentalReminderEmail(args: {
  workspaceId: string;
  recipients: string[];
  phoneNumberLabel: string;
  daysUntilDue: number;
  dueDate: Date;
}): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());
  const { subject, html, text } = buildReminderEmail(args);
  await resend.emails.send({
    from: "Callcaster <info@callcaster.ca>",
    to: args.recipients,
    subject,
    html,
    text,
  });
}

/**
 * Daily sweep for number rental billing.
 * Runs as the self-scheduling `number_rental_billing` worker job (or via
 * admin action / the CRON_SECRET-gated enqueue route).
 *
 * Note: automatic release of unpaid rented numbers is not implemented yet
 * (`released` is always `0` and `autoReleaseImplemented` is always `false`).
 * Numbers with unpaid renewals must currently be released manually.
 */
export async function runNumberRentalBilling(args: {
  workspaceId?: string;
  today?: Date;
}): Promise<{
  ok: true;
  processed: number;
  charged: number;
  unpaid: number;
  released: number;
  remindersSent: number;
  remindersFailed: number;
  autoReleaseImplemented: false;
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
  let unpaid = 0;
  const released = 0;
  let remindersSent = 0;
  let remindersFailed = 0;

  for (const number of numbers) {
    const anchorDate = number.created_at;
    const currentMonthDue = getDueDate(anchorDate, today);
    const phoneNumberLabel = number.phone_number ?? number.friendly_name ?? String(number.id);

    // Reminder windows for the upcoming due date (independent of catch-up).
    if (!isSameDay(today, currentMonthDue)) {
      const daysUntilDue = daysBetween(today, currentMonthDue);
      if (REMINDER_WINDOWS_DAYS.includes(daysUntilDue)) {
        try {
          const recipients = await listWorkspaceOwnerAdminEmails(number.workspace);
          if (recipients.length === 0) {
            remindersFailed++;
            logger.warn("number_rental_billing.reminder_no_recipients", {
              numberId: number.id,
              workspaceId: number.workspace,
            });
          } else {
            await sendNumberRentalReminderEmail({
              workspaceId: number.workspace,
              recipients,
              phoneNumberLabel,
              daysUntilDue,
              dueDate: currentMonthDue,
            });
            remindersSent++;
          }
        } catch (error) {
          remindersFailed++;
          logger.error("number_rental_billing.reminder_failed", {
            numberId: number.id,
            workspaceId: number.workspace,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Charge every elapsed cycle that has no ledger row yet. This both bills
    // today's cycle when the run lands on the due date AND catches up cycles
    // missed while the worker wasn't running (previously a missed anchor day
    // meant a permanently unbilled month). An unpaid cycle is retried on
    // every subsequent daily run until the workspace can afford it.
    for (const dueDate of elapsedDueDates(anchorDate, today)) {
      const cycleKey = getCycleKey(dueDate);
      const idempotencyKey = numberRentalCycleKey(number.id, cycleKey);

      // Idempotency is authoritative: if this cycle was already billed on an
      // earlier (at-least-once) run, take no action. Checking the balance
      // first would be wrong — a re-run after the charge (or any other spend)
      // dropped the balance below the rental cost would falsely re-mark a paid
      // number as unpaid.
      const alreadyBilled = await tdb.transaction_history.findFirst({
        where: eq(transactionHistoryTable.idempotency_key, idempotencyKey),
        columns: { id: true },
      });
      if (alreadyBilled) continue;

      // The ledger RPC applies a DEBIT unconditionally (no balance floor), so a
      // failed charge does NOT throw — it would silently drive the balance
      // negative and keep the number active for free. Check funds explicitly
      // and route an unaffordable new charge to the unpaid/grace path instead.
      const balance = await getWorkspaceCreditsBalance(number.workspace);
      if (balance != null && balance < NUMBER_RENTAL_MONTHLY_CREDITS) {
        unpaid++;
        logger.info("Number rental left unpaid: insufficient credits", {
          numberId: number.id,
          workspaceId: number.workspace,
          balance,
          required: NUMBER_RENTAL_MONTHLY_CREDITS,
          cycleKey,
        });
        // Later cycles for this number would also be unaffordable.
        break;
      }

      try {
        await insertTransactionHistoryIdempotent({
          workspaceId: number.workspace,
          type: "DEBIT",
          amount: debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS),
          note: `Monthly rental for ${phoneNumberLabel} (cycle ${cycleKey})`,
          idempotencyKey,
        });
        charged++;
      } catch (error) {
        unpaid++;
        logger.error("Number rental charge failed", {
          numberId: number.id,
          workspaceId: number.workspace,
          cycleKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Auto-release of numbers with an unpaid previous cycle is not
    // implemented yet — see the `autoReleaseImplemented: false` flag on the
    // return value. Numbers must be released manually for now.
  }

  return {
    ok: true,
    processed: numbers.length,
    charged,
    unpaid,
    released,
    remindersSent,
    remindersFailed,
    autoReleaseImplemented: false,
  };
}
