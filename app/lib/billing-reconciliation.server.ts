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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const TERMINAL_SMS_STATUSES = TERMINAL_BILLABLE_SMS_STATUSES;
const BILLABLE_CALL_STATUSES = TERMINAL_BILLABLE_CALL_STATUSES;

export type { BillingReconciliationReport };

export async function loadBillingEntityAudit(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  period: { startDate: string; endDate: string };
}): Promise<BillingEntityAudit> {
  const periodStart = `${args.period.startDate}T00:00:00.000Z`;
  const periodEnd = `${args.period.endDate}T23:59:59.999Z`;

  const [messagesResult, callsResult, debitsResult] = await Promise.all([
    args.supabaseClient
      .from("message")
      .select("sid", { count: "exact", head: true })
      .eq("workspace", args.workspaceId)
      .neq("direction", "inbound")
      .in("status", [...TERMINAL_SMS_STATUSES])
      .gte("date_created", periodStart)
      .lte("date_created", periodEnd),
    args.supabaseClient
      .from("call")
      .select("sid", { count: "exact", head: true })
      .eq("workspace", args.workspaceId)
      .in("status", [...BILLABLE_CALL_STATUSES])
      .gte("date_created", periodStart)
      .lte("date_created", periodEnd),
    args.supabaseClient
      .from("transaction_history")
      .select("idempotency_key", { count: "exact", head: true })
      .eq("workspace", args.workspaceId)
      .eq("type", "DEBIT")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .like("idempotency_key", "sms:%"),
  ]);

  const callDebitsResult = await args.supabaseClient
    .from("transaction_history")
    .select("idempotency_key", { count: "exact", head: true })
    .eq("workspace", args.workspaceId)
    .eq("type", "DEBIT")
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd)
    .like("idempotency_key", "call:%");

  const billableMessages = messagesResult.count ?? 0;
  const debitedMessages = debitsResult.count ?? 0;
  const billableCalls = callsResult.count ?? 0;
  const debitedCalls = callDebitsResult.count ?? 0;

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
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  twilioUsage: TwilioUsageRecord[];
  referenceDate?: Date;
}): Promise<BillingReconciliationReport> {
  const period = getTwilioUsageDateRange(args.referenceDate);

  const periodStart = `${period.startDate}T00:00:00.000Z`;
  const periodEnd = `${period.endDate}T23:59:59.999Z`;

  const [{ data: ledgerRows, error }, entityAudit] = await Promise.all([
    args.supabaseClient
      .from("transaction_history")
      .select("type, amount, idempotency_key, created_at")
      .eq("workspace", args.workspaceId)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd),
    loadBillingEntityAudit({
      supabaseClient: args.supabaseClient,
      workspaceId: args.workspaceId,
      period,
    }),
  ]);

  if (error) {
    throw error;
  }

  return buildBillingReconciliationReport({
    period,
    twilioUsage: args.twilioUsage,
    ledgerRows: (ledgerRows ?? []) as LedgerTransactionRow[],
    entityAudit,
  });
}
