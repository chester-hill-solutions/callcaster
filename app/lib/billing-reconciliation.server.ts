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
import { and, gte, inArray, like, lte, ne, eq } from "drizzle-orm";
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
  const callWhere = and(
    inArray(callTable.status, [...BILLABLE_CALL_STATUSES]),
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

  const [billableMessages, billableCalls, debitedMessages, debitedCalls] =
    await Promise.all([
      tdb.message.count({ where: messageWhere }),
      tdb.call.count({ where: callWhere }),
      tdb.transaction_history.count({ where: smsDebitWhere }),
      tdb.transaction_history.count({ where: callDebitWhere }),
    ]);

  return {
    billableMessages,
    debitedMessages,
    messageGap: billableMessages - debitedMessages,
    billableCalls,
    debitedCalls,
    callGap: billableCalls - debitedCalls,
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
