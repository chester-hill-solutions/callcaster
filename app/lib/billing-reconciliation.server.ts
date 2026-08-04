import {
  buildBillingReconciliationReport,
  type BillingEntityAudit,
  type BillingReconciliationReport,
  type LedgerTransactionRow,
  type TwilioUsageRecord,
} from "../../shared/billing-reconciliation";
import { getTwilioUsageDateRange } from "@/lib/twilio-usage";
import {
  TERMINAL_BILLABLE_CALL_STATUSES,
  TERMINAL_BILLABLE_SMS_STATUSES,
} from "@/lib/pricing";
import type { Database } from "@/lib/db-types";
import { and, gt, gte, inArray, like, lte, ne, eq, sql } from "drizzle-orm";
import {
  call as callTable,
  message as messageTable,
  transaction_history as transactionHistoryTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";

const TERMINAL_SMS_STATUSES = TERMINAL_BILLABLE_SMS_STATUSES;
const BILLABLE_CALL_STATUSES = TERMINAL_BILLABLE_CALL_STATUSES;

export type { BillingReconciliationReport };

export async function loadBillingEntityAudit(args: {
  null?: never;
  workspaceId: string;
  period: { startDate: string; endDate: string };
}): Promise<BillingEntityAudit> {
  const periodStart = `${args.period.startDate}T00:00:00.000Z`;
  const periodEnd = `${args.period.endDate}T23:59:59.999Z`;
  const tdb = createTenantDb(args.workspaceId);

  const messageWhere = and(
    ne(messageTable.direction, "inbound"),
    inArray(messageTable.status, [...TERMINAL_SMS_STATUSES]),
    gte(messageTable.date_created, periodStart),
    lte(messageTable.date_created, periodEnd),
  );
  // The debit gate is status AND non-zero duration (twilio-call-status.server.ts
  // returns null when duration <= 0; shared/pricing.ts documents why). Counting
  // on status alone here made every failed/busy/no-answer call an unmatched
  // "billable" call, so callGap grew with dial volume and the variance alarm was
  // permanently true. Both sides must mean the same thing by "billable".
  const callDurationSeconds = sql<number>`greatest(
    coalesce(nullif(${callTable.duration}, '')::numeric, 0),
    coalesce(${callTable.call_duration}, 0)
  )`;
  const callWhere = and(
    inArray(callTable.status, [...BILLABLE_CALL_STATUSES]),
    gt(callDurationSeconds, 0),
    gte(callTable.date_created, periodStart),
    lte(callTable.date_created, periodEnd),
  );
  const smsDebitWhere = and(
    eq(transactionHistoryTable.type, "DEBIT"),
    gte(transactionHistoryTable.created_at, periodStart),
    lte(transactionHistoryTable.created_at, periodEnd),
    like(transactionHistoryTable.idempotency_key, "sms:%"),
  );
  const callDebitWhere = and(
    eq(transactionHistoryTable.type, "DEBIT"),
    gte(transactionHistoryTable.created_at, periodStart),
    lte(transactionHistoryTable.created_at, periodEnd),
    like(transactionHistoryTable.idempotency_key, "call:%"),
  );

  const [billableMessages, billableCalls, debitedMessages, debitedCalls, minuteRows] =
    await Promise.all([
      tdb.message.count({ where: messageWhere }),
      tdb.call.count({ where: callWhere }),
      tdb.transaction_history.count({ where: smsDebitWhere }),
      tdb.transaction_history.count({ where: callDebitWhere }),
      // Started minutes, summed with Twilio's rounding so the figure is
      // comparable to its usage records rather than to a credit total.
      tdb.call.findMany({
        where: callWhere,
        extras: {
          startedMinutes:
            sql<number>`ceil(${callDurationSeconds} / 60.0)`.as("started_minutes"),
        },
        columns: { sid: true },
      }),
    ]);

  const billedVoiceMinutes = minuteRows.reduce(
    (total, row) => total + Number((row as { startedMinutes?: unknown }).startedMinutes ?? 0),
    0,
  );

  return {
    billableMessages,
    debitedMessages,
    messageGap: billableMessages - debitedMessages,
    billableCalls,
    debitedCalls,
    callGap: billableCalls - debitedCalls,
    billedVoiceMinutes,
  };
}

export async function loadBillingReconciliationReport(args: {
  null?: never;
  workspaceId: string;
  twilioUsage: TwilioUsageRecord[];
  referenceDate?: Date;
}): Promise<BillingReconciliationReport> {
  const period = getTwilioUsageDateRange(args.referenceDate);
  const periodStart = `${period.startDate}T00:00:00.000Z`;
  const periodEnd = `${period.endDate}T23:59:59.999Z`;
  const tdb = createTenantDb(args.workspaceId);

  const [ledgerRows, entityAudit] = await Promise.all([
    tdb.transaction_history.findMany({
      where: and(
        gte(transactionHistoryTable.created_at, periodStart),
        lte(transactionHistoryTable.created_at, periodEnd),
      ),
      columns: {
        type: true,
        amount: true,
        idempotency_key: true,
        created_at: true,
      },
    }),
    loadBillingEntityAudit({
      workspaceId: args.workspaceId,
      period,
    }),
  ]);

  return buildBillingReconciliationReport({
    period,
    twilioUsage: args.twilioUsage,
    ledgerRows: ledgerRows as LedgerTransactionRow[],
    entityAudit,
  });
}
