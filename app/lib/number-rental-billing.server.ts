import { Resend } from "resend";
import { eq, and, gte } from "drizzle-orm";
import {
  workspace_number as workspaceNumberTable,
  workspace as workspaceTable,
  transaction_history as transactionHistoryTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { db } from "@/server/db";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { notifyOps } from "@/lib/ops-alert.server";
import {
  rentalActionForUnpaidCycles,
  type RentalLifecycleAction,
} from "@/lib/number-rental-lifecycle";
import { numberRentalCycleKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import { logger } from "@/lib/logger.server";
import {
  createWorkspaceTwilioInstance,
  removeWorkspacePhoneNumber,
} from "@/lib/database/workspace.server";
import { listWorkspaceOwnerAdminEmails } from "@/lib/workspace-members-db.server";
import { env } from "@/lib/env.server";

const NUMBER_RENTAL_MONTHLY_CREDITS = 100;
const ROLLOUT_CUTOFF_DATE = "2026-04-01";
const REMINDER_WINDOWS_DAYS = [25, 15, 3];

function getCycleKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The next renewal due date at or after `today`.
 *
 * Reminders used to be measured against the due date in *today's own month*, so
 * `daysUntilDue` was `anchorDay - todayDay` and went negative the moment the day
 * passed. Reaching the 25-day window therefore required an anchor day of 26 or
 * later, the 15-day window an anchor of 16+, and the 3-day window an anchor of
 * 4+ — a number rented on the 2nd got no reminder at all, ever.
 */
function getNextDueDate(anchorDate: string, today: Date): Date {
  const thisMonth = getDueDate(anchorDate, today);
  if (thisMonth.getTime() >= today.getTime()) return thisMonth;
  const nextMonthCursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
  );
  return getDueDate(anchorDate, nextMonthCursor);
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
 * Every rental *renewal* due date after the anchor, through `today`.
 *
 * The creation month is excluded: `purchaseWorkspaceNumber` already debits it
 * at purchase under `numberRentalPurchaseKey`. This function's keys are
 * `numberRentalCycleKey`, and the already-billed probe below only looks up the
 * cycle key — so including the anchor month charged the first month twice, once
 * on purchase and again on the same day's sweep.
 *
 * Billing from a list rather than "is today the anchor day?" means a run that
 * was skipped (worker down, deploy gap) charges the missed cycle on the next
 * run instead of leaving it unbilled forever.
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
    // Strictly after the anchor. Getting this boundary wrong in the other
    // direction skips a month permanently and silently — every charge is
    // idempotency-keyed, so nothing errors and nothing retries.
    if (due.getTime() > anchor.getTime()) dues.push(due);
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
 * Apply one rung of the non-payment ladder to a single number.
 *
 * Returns the action actually taken, which may be "none" — a release is
 * skipped when the number has no Twilio SID, because there is nothing to
 * release and deleting the row would lose the record of a number the customer
 * may still believe they own.
 *
 * Every step notifies ops. Suspension and release also email the workspace
 * owners/admins, because both are things a customer must be told about rather
 * than discover.
 */
async function applyRentalLifecycleAction(args: {
  action: RentalLifecycleAction;
  number: {
    id: number;
    workspace: string;
    twilio_phone_number_sid: string | null;
    suspended_at?: unknown;
    rental_warned_cycle?: unknown;
  };
  phoneNumberLabel: string;
  unpaidCycles: number;
  tdb: ReturnType<typeof createTenantDb>;
}): Promise<RentalLifecycleAction> {
  const { action, number, phoneNumberLabel, unpaidCycles, tdb } = args;
  if (action === "none") return "none";

  const context = {
    numberId: number.id,
    workspaceId: number.workspace,
    phoneNumber: phoneNumberLabel,
    unpaidCycles,
  };

  const recipients = await listWorkspaceOwnerAdminEmails(number.workspace).catch(() => []);

  if (action === "warn") {
    // Idempotent, the way the suspend rung already was. The sweep runs daily
    // and this rung fires whenever the unpaid count is exactly 1, so without a
    // marker a workspace received "Payment needed for …" every day for up to a
    // month, until a second cycle escalated it. Worse after suspensions became
    // clearable: a suspended customer who partially pays drops back to one
    // unpaid cycle and would get daily warn mail while still suspended.
    //
    // The marker stores the CYCLE COUNT, not a boolean: if the customer pays
    // some and falls behind again, the count differs from the stored one and a
    // fresh warning is correct. A boolean would suppress that second,
    // legitimate warning forever.
    if (Number(number.rental_warned_cycle) === unpaidCycles) return "none";

    await tdb.workspace_number.update({
      set: { rental_warned_cycle: unpaidCycles },
      where: eq(workspaceNumberTable.id, number.id),
    });
    await notifyOps({
      event: "billing.rental_unpaid_warned",
      severity: "warn",
      summary: `Rental unpaid for ${phoneNumberLabel} — customer warned`,
      dedupeKey: `rental_warn:${number.id}`,
      context,
    });
    await sendRentalLifecycleEmail({ action, recipients, phoneNumberLabel }).catch((error) => {
      logger.error("number_rental_billing.warn_email_failed", { ...context, error: String(error) });
    });
    return "warn";
  }

  if (action === "suspend") {
    // Idempotent: a number already suspended is not re-suspended or re-emailed
    // on every subsequent daily run.
    if (number.suspended_at) return "none";
    await tdb.workspace_number.update({
      set: { suspended_at: new Date().toISOString() },
      where: eq(workspaceNumberTable.id, number.id),
    });
    await notifyOps({
      event: "billing.rental_suspended",
      severity: "warn",
      summary: `Rental unpaid for ${phoneNumberLabel} — number suspended for outbound use`,
      dedupeKey: `rental_suspend:${number.id}`,
      context,
    });
    await sendRentalLifecycleEmail({ action, recipients, phoneNumberLabel }).catch((error) => {
      logger.error("number_rental_billing.suspend_email_failed", { ...context, error: String(error) });
    });
    return "suspend";
  }

  // release — irreversible at Twilio.
  if (!number.twilio_phone_number_sid) {
    logger.error("number_rental_billing.release_skipped_no_sid", context);
    return "none";
  }

  // removeWorkspacePhoneNumber catches everything internally and RETURNS
  // `{ error }` — it never throws. Left unchecked, a failed Twilio release
  // still emailed the customer "this cannot be undone", paged ops claiming an
  // irreversible action had completed, counted a release that never happened,
  // and repeated the whole thing the next day on a number the workspace still
  // owns and still is not paying for.
  const release = await removeWorkspacePhoneNumber({
    workspaceId: number.workspace,
    numberId: BigInt(number.id),
    tdb,
  });
  if (release?.error) {
    throw release.error instanceof Error
      ? release.error
      : new Error(String(release.error));
  }

  // Only after the release actually succeeded. This used to run first, so that
  // a failed email could not silently deprive the customer of a number — but
  // that ordering is only safe while the release cannot fail, and it can. A
  // false "your number has been released" is worse than a late true one; the
  // release is logged here if the email is what fails.
  await sendRentalLifecycleEmail({ action, recipients, phoneNumberLabel }).catch((error) => {
    logger.error("number_rental_billing.release_email_failed", { ...context, error: String(error) });
  });

  await notifyOps({
    event: "billing.rental_released",
    severity: "page",
    summary: `Rental unpaid for ${phoneNumberLabel} — number RELEASED at Twilio (irreversible)`,
    dedupeKey: `rental_release:${number.id}`,
    context,
  });
  return "release";
}

async function sendRentalLifecycleEmail(args: {
  action: RentalLifecycleAction;
  recipients: string[];
  phoneNumberLabel: string;
}): Promise<void> {
  if (args.recipients.length === 0) return;
  const copy = {
    warn: {
      subject: `Payment needed for ${args.phoneNumberLabel}`,
      body: `We could not renew ${args.phoneNumberLabel} because your workspace is short on credits. Add credits to keep the number — if it stays unpaid it will be suspended, and then released.`,
    },
    suspend: {
      subject: `${args.phoneNumberLabel} is suspended`,
      body: `${args.phoneNumberLabel} has been suspended for outbound use because its rental is unpaid. You can still receive calls on it. Add credits to restore it — if it stays unpaid it will be released and you will lose the number.`,
    },
    release: {
      subject: `${args.phoneNumberLabel} has been released`,
      body: `${args.phoneNumberLabel} has been released because its rental went unpaid. This cannot be undone and the number is no longer yours. You can rent a new number at any time.`,
    },
  }[args.action as "warn" | "suspend" | "release"];
  if (!copy) return;

  const resend = new Resend(env.RESEND_API_KEY());
  await resend.emails.send({
    from: "Callcaster <info@callcaster.ca>",
    to: args.recipients,
    subject: copy.subject,
    html: `<p>${copy.body}</p>`,
    text: copy.body,
  });
}

/**
 * Daily sweep for number rental billing.
 * Runs as the self-scheduling `number_rental_billing` worker job (or via
 * admin action / the CRON_SECRET-gated enqueue route).
 *
 * Unpaid rentals escalate: one unpaid cycle warns the customer, the next
 * suspends the number for outbound use, the next releases it at Twilio. See
 * number-rental-lifecycle.ts for the ladder and applyRentalLifecycleAction for
 * what each rung does.
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
  suspended: number;
  unsuspended: number;
  warned: number;
  remindersSent: number;
  remindersFailed: number;
  autoReleaseImplemented: true;
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
  let released = 0;
  let suspended = 0;
  let unsuspended = 0;
  let warned = 0;
  let remindersSent = 0;
  let remindersFailed = 0;

  for (const number of numbers) {
    const anchorDate = number.created_at;
    const nextDue = getNextDueDate(anchorDate, today);
    const phoneNumberLabel = number.phone_number ?? number.friendly_name ?? String(number.id);

    // Reminder windows for the upcoming due date (independent of catch-up).
    if (!isSameDay(today, nextDue)) {
      const daysUntilDue = daysBetween(today, nextDue);
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
              dueDate: nextDue,
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
    // Unpaid cycles for THIS number, derived from the ledger rather than a
    // counter column: a cycle is unpaid exactly when it has no
    // transaction_history row, the same fact the idempotency check below
    // already relies on. Nothing to keep in sync, and a credit applied
    // out-of-band de-escalates the number automatically on the next run.
    //
    // Counted as "elapsed cycles minus those already billed minus those
    // charged now" rather than incremented in the unaffordable branch, because
    // that branch BREAKS on the first cycle it cannot pay — incrementing there
    // caps the count at 1 no matter how many cycles are owed, so suspend and
    // release could never be reached.
    const dueDates = elapsedDueDates(anchorDate, today);
    let previouslyBilledCycles = 0;
    let chargedCyclesForNumber = 0;

    for (const dueDate of dueDates) {
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
      if (alreadyBilled) {
        previouslyBilledCycles++;
        continue;
      }

      // The ledger RPC applies a DEBIT unconditionally (no balance floor), so a
      // failed charge does NOT throw — it would silently drive the balance
      // negative and keep the number active for free. Check funds explicitly
      // and route an unaffordable new charge to the unpaid/grace path instead.
      const balance = await getWorkspaceCreditsBalance(number.workspace);
      // Treat an unknown balance (null → workspace row missing / replication
      // gap) as unaffordable rather than debiting it negative.
      if (balance == null || balance < NUMBER_RENTAL_MONTHLY_CREDITS) {
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
        await insertTransactionHistoryIdempotent(db, {
          workspaceId: number.workspace,
          type: "DEBIT",
          amount: debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS),
          note: `Monthly rental for ${phoneNumberLabel} (cycle ${cycleKey})`,
          idempotencyKey,
        });
        charged++;
        chargedCyclesForNumber++;

        // Paying restores outbound use. Without this `suspended_at` is written
        // once and never cleared by anything, so a suspended customer who pays
        // stays suspended forever — while the suspension email tells them to
        // "add credits to restore it".
        if (number.suspended_at) {
          await tdb.workspace_number.update({
            set: { suspended_at: null },
            where: eq(workspaceNumberTable.id, number.id),
          });
          number.suspended_at = null;
          unsuspended++;
          logger.info("number_rental_billing.unsuspended_after_payment", {
            numberId: number.id,
            workspaceId: number.workspace,
            cycleKey,
          });
        }
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

    // Non-payment ladder: 1 unpaid cycle warns, 2 suspends, 3 releases.
    // The action is derived from the count in one place
    // (number-rental-lifecycle.ts) so the ladder is not spread through nested
    // conditionals here. Each step is best-effort and independent: failing to
    // send a warning must not prevent a later suspend, and failing to suspend
    // must not prevent the eventual release.
    const unpaidCyclesForNumber =
      dueDates.length - previouslyBilledCycles - chargedCyclesForNumber;

    if (unpaidCyclesForNumber > 0) {
      const action = rentalActionForUnpaidCycles(unpaidCyclesForNumber, {
        alreadySuspended: Boolean(number.suspended_at),
      });
      try {
        const outcome = await applyRentalLifecycleAction({
          action,
          number,
          phoneNumberLabel,
          unpaidCycles: unpaidCyclesForNumber,
          tdb,
        });
        if (outcome === "warn") warned++;
        if (outcome === "suspend") suspended++;
        if (outcome === "release") released++;
      } catch (error) {
        logger.error("number_rental_billing.lifecycle_action_failed", {
          numberId: number.id,
          workspaceId: number.workspace,
          action,
          unpaidCycles: unpaidCyclesForNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ok: true,
    processed: numbers.length,
    charged,
    unpaid,
    released,
    suspended,
    unsuspended,
    warned,
    remindersSent,
    remindersFailed,
    autoReleaseImplemented: true,
  };
}
