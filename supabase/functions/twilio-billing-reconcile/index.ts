import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
  hasMaterialBillingVariance,
  type BillingReconciliationReport,
  type LedgerTransactionRow,
  type TwilioUsageRecord,
} from "../../../shared/billing-reconciliation.ts";
import { readTwilioWorkspaceCredentials } from "../_shared/twilio-workspace-credentials.ts";
import {
  mapWithConcurrency,
  parseBillingReconcileBody,
} from "../_shared/billing-reconcile-request.ts";
import {
  TERMINAL_BILLABLE_CALL_STATUSES,
  TERMINAL_BILLABLE_SMS_STATUSES,
} from "../../../shared/pricing.ts";

const TERMINAL_SMS_STATUSES = TERMINAL_BILLABLE_SMS_STATUSES;
const BILLABLE_CALL_STATUSES = TERMINAL_BILLABLE_CALL_STATUSES;

function getReconciliationPeriod(referenceDate = new Date()) {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  startDate.setUTCDate(startDate.getUTCDate() - 30);
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

async function loadEntityAudit(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  period: { startDate: string; endDate: string };
}) {
  const periodStart = `${args.period.startDate}T00:00:00.000Z`;
  const periodEnd = `${args.period.endDate}T23:59:59.999Z`;

  const [messagesResult, callsResult, smsDebitsResult, callDebitsResult] =
    await Promise.all([
      args.supabase
        .from("message")
        .select("sid", { count: "exact", head: true })
        .eq("workspace", args.workspaceId)
        .neq("direction", "inbound")
        .in("status", TERMINAL_SMS_STATUSES)
        .gte("date_created", periodStart)
        .lte("date_created", periodEnd),
      args.supabase
        .from("call")
        .select("sid", { count: "exact", head: true })
        .eq("workspace", args.workspaceId)
        .in("status", BILLABLE_CALL_STATUSES)
        .gte("date_created", periodStart)
        .lte("date_created", periodEnd),
      args.supabase
        .from("transaction_history")
        .select("idempotency_key", { count: "exact", head: true })
        .eq("workspace", args.workspaceId)
        .eq("type", "DEBIT")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .like("idempotency_key", "sms:%"),
      args.supabase
        .from("transaction_history")
        .select("idempotency_key", { count: "exact", head: true })
        .eq("workspace", args.workspaceId)
        .eq("type", "DEBIT")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .like("idempotency_key", "call:%"),
    ]);

  const billableMessages = messagesResult.count ?? 0;
  const debitedMessages = smsDebitsResult.count ?? 0;
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

async function reconcileWorkspace(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  twilio: Twilio.Twilio;
  accountSid: string;
}): Promise<BillingReconciliationReport | null> {
  const period = getReconciliationPeriod();
  const periodStart = `${period.startDate}T00:00:00.000Z`;
  const periodEnd = `${period.endDate}T23:59:59.999Z`;

  const [usageRecords, ledgerResult, entityAudit] = await Promise.all([
    args.twilio.usage.records.list(),
    args.supabase
      .from("transaction_history")
      .select("type, amount, idempotency_key, created_at")
      .eq("workspace", args.workspaceId)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd),
    loadEntityAudit({
      supabase: args.supabase,
      workspaceId: args.workspaceId,
      period,
    }),
  ]);

  if (ledgerResult.error) {
    throw ledgerResult.error;
  }

  const twilioUsage: TwilioUsageRecord[] = usageRecords.map((record) => ({
    category: record.category,
    description: record.description,
    usage: record.usage,
    usageUnit: record.usageUnit,
    price: record.price.toString(),
    startDate: record.startDate?.toISOString(),
    endDate: record.endDate?.toISOString(),
  }));

  return buildBillingReconciliationReport({
    period,
    twilioUsage,
    ledgerRows: (ledgerResult.data ?? []) as LedgerTransactionRow[],
    entityAudit,
  });
}

function hasMaterialVariance(report: BillingReconciliationReport): boolean {
  return hasMaterialBillingVariance(report);
}

async function persistBillingReconciliationSnapshot(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  report: BillingReconciliationReport;
}) {
  const snapshot = buildBillingReconciliationSnapshot(args.report, "cron");
  const { data: workspace } = await args.supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", args.workspaceId)
    .single();

  const twilioData =
    workspace?.twilio_data && typeof workspace.twilio_data === "object"
      ? (workspace.twilio_data as Record<string, unknown>)
      : {};

  await args.supabase
    .from("workspace")
    .update({
      twilio_data: {
        ...twilioData,
        billingReconciliationSnapshot: snapshot,
      },
    })
    .eq("id", args.workspaceId);
}

export async function handleRequest(
  req: Request,
  options?: { supabase?: SupabaseClient },
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase =
    options?.supabase ??
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const request = parseBillingReconcileBody(body);

  let workspaceQuery = supabase
    .from("workspace")
    .select("id, name, twilio_data")
    .not("twilio_data", "is", null);

  if (request.workspaceId) {
    workspaceQuery = workspaceQuery.eq("id", request.workspaceId);
  }

  const { data: workspaces, error } = await workspaceQuery.limit(request.limit);

  if (error) {
    console.error("twilio-billing-reconcile workspace query", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eligible = (workspaces ?? []).filter((workspace) => {
    const creds = readTwilioWorkspaceCredentials(workspace.twilio_data);
    return Boolean(creds?.sid && creds.authToken);
  });

  const twilioCache = new Map<string, Twilio.Twilio>();

  const batchResults = await mapWithConcurrency(
    eligible,
    request.concurrency,
    async (workspace) => {
      const creds = readTwilioWorkspaceCredentials(workspace.twilio_data)!;
      let twilio = twilioCache.get(creds.sid);
      if (!twilio) {
        twilio = new Twilio(creds.sid, creds.authToken);
        twilioCache.set(creds.sid, twilio);
      }

      try {
        const report = await reconcileWorkspace({
          supabase,
          workspaceId: workspace.id,
          twilio,
          accountSid: creds.sid,
        });
        if (!report) {
          return null;
        }

        const materialVariance = hasMaterialVariance(report);
        if (materialVariance) {
          console.warn(
            "twilio-billing-reconcile variance",
            JSON.stringify({
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              smsVariance: report.categories.sms.variance,
              voiceVariance: report.categories.voice.variance,
              messageGap: report.entityAudit.messageGap,
              callGap: report.entityAudit.callGap,
              unrecognizedDebitEvents: report.unrecognizedDebitEvents,
            }),
          );
        }

        await persistBillingReconciliationSnapshot({
          supabase,
          workspaceId: workspace.id,
          report,
        }).catch((persistError) => {
          const message =
            persistError instanceof Error
              ? persistError.message
              : String(persistError);
          console.error(
            "twilio-billing-reconcile snapshot persist failed",
            workspace.id,
            message,
          );
        });

        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          materialVariance,
          report,
        };
      } catch (reconcileError) {
        const message =
          reconcileError instanceof Error
            ? reconcileError.message
            : String(reconcileError);
        console.error(
          "twilio-billing-reconcile failed",
          workspace.id,
          message,
        );
        return null;
      }
    },
  );

  const results = batchResults.filter(
    (row): row is NonNullable<typeof row> => row != null,
  );

  return new Response(
    JSON.stringify({
      scanned: (workspaces ?? []).length,
      eligible: eligible.length,
      reconciled: results.length,
      materialVarianceCount: results.filter((row) => row.materialVariance).length,
      concurrency: request.concurrency,
      results: results.map(({ workspaceId, workspaceName, materialVariance, report }) => ({
        workspaceId,
        workspaceName,
        materialVariance,
        period: report.period,
        categories: report.categories,
        entityAudit: report.entityAudit,
        twilioTotalCostUsd: report.twilioTotalCostUsd,
        ledgerDebitCredits: report.ledgerDebitCredits,
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
