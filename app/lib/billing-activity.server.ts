import { eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  message as messageTable,
  transaction_history as transactionHistoryTable,
} from "@/db/schema";
import type { BillingActivityFilter, BillingActivityRow } from "@/lib/billing-activity-projection";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import type { TransactionType } from "@/lib/transaction-history-display";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

/** Page size for the billing activity ledger feed. */
export const BILLING_ACTIVITY_LIMIT = 500;

export type BillingActivityTotals = {
  /** Total debits (sum of all DEBIT amounts), as a positive magnitude. */
  usage: number;
  /** Total credits added (sum of all CREDIT amounts). */
  purchased: number;
};

export type LedgerActivityRow = {
  id: number;
  created_at: string;
  type: string;
  amount: number;
  note: string | null;
  idempotency_key: string | null;
  campaign_id: number | null;
  message_sid: string | null;
  call_sid: string | null;
};

export type SidCampaignLookup = ReadonlyMap<string, number | null>;

export type WorkspaceBillingActivity = {
  ok: true;
  balance: number;
  history: BillingActivityRow[];
  campaignNames: Record<number, string>;
  page: number;
  pageSize: number;
  totalCount: number;
  totals: BillingActivityTotals;
};

export type WorkspaceBillingActivityError = {
  ok: false;
  error: string;
  status: number;
};

export type BillingActivityQuery = {
  /** 1-based ledger page; clamped to >= 1. */
  page?: number;
  /** Restrict the ledger rows and totals to a view (default "all"). */
  filter?: BillingActivityFilter;
};

/** Type filter mapped from the activity view; undefined for "all". */
function ledgerWhereFor(filter: BillingActivityFilter): SQL | undefined {
  if (filter === "purchases") return eq(transactionHistoryTable.type, "CREDIT");
  if (filter === "usage") return eq(transactionHistoryTable.type, "DEBIT");
  return undefined;
}

function toTransactionType(type: string): TransactionType {
  return type === "CREDIT" ? "CREDIT" : "DEBIT";
}

/**
 * Ledger rows written before the campaign id was recorded on the debit still
 * name the message or call; resolve the campaign through that SID instead.
 */
export function attributeLedgerCampaigns(
  rows: readonly LedgerActivityRow[],
  lookups: { messages: SidCampaignLookup; calls: SidCampaignLookup },
): BillingActivityRow[] {
  return rows.map((row) => {
    let campaignId = row.campaign_id;
    if (campaignId == null && row.message_sid) {
      campaignId = lookups.messages.get(row.message_sid) ?? null;
    }
    if (campaignId == null && row.call_sid) {
      campaignId = lookups.calls.get(row.call_sid) ?? null;
    }
    return {
      id: String(row.id),
      created_at: row.created_at,
      type: toTransactionType(row.type),
      amount: row.amount,
      note: row.note,
      idempotency_key: row.idempotency_key,
      campaign_id: campaignId,
    };
  });
}

function unattributedSids(
  rows: readonly LedgerActivityRow[],
  column: "message_sid" | "call_sid",
): string[] {
  const sids = new Set<string>();
  for (const row of rows) {
    const sid = row[column];
    if (row.campaign_id == null && sid) sids.add(sid);
  }
  return Array.from(sids);
}

async function lookupMessageCampaigns(
  tdb: TenantDb,
  sids: string[],
): Promise<SidCampaignLookup> {
  if (sids.length === 0) return new Map();
  const rows = await tdb.message.findMany({
    where: inArray(messageTable.sid, sids),
    columns: { sid: true, campaign_id: true },
  });
  return new Map(rows.map((row) => [row.sid, row.campaign_id ?? null]));
}

async function lookupCallCampaigns(
  tdb: TenantDb,
  sids: string[],
): Promise<SidCampaignLookup> {
  if (sids.length === 0) return new Map();
  const rows = await tdb.call.findMany({
    where: inArray(callTable.sid, sids),
    columns: { sid: true, campaign_id: true },
  });
  return new Map(rows.map((row) => [row.sid, row.campaign_id ?? null]));
}

async function lookupCampaignNames(
  tdb: TenantDb,
  history: readonly BillingActivityRow[],
): Promise<Record<number, string>> {
  const ids = Array.from(
    new Set(
      history.flatMap((row) => (row.campaign_id == null ? [] : [row.campaign_id])),
    ),
  );
  if (ids.length === 0) return {};
  const rows = await tdb.campaign.findMany({
    where: inArray(campaignTable.id, ids),
    columns: { id: true, title: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.title]));
}

export type LedgerTotalsRow = { usage: string | number; purchased: string | number };

/**
 * Full-ledger usage and purchase totals for a workspace. Sums the raw amount
 * column (DEBITs are negative) so the numbers reconcile with everything that
 * was ever charged, independent of which activity page is being viewed.
 */
async function loadLedgerTotals(
  tdb: TenantDb,
  workspaceId: string,
): Promise<BillingActivityTotals> {
  const rows = (await tdb.execute(sql`
    select
      coalesce(sum(amount) filter (where type = 'DEBIT'), 0) as usage,
      coalesce(sum(amount) filter (where type = 'CREDIT'), 0) as purchased
    from transaction_history
    where workspace = ${workspaceId}::uuid
  `)) as LedgerTotalsRow[];
  const first = rows[0] ?? { usage: 0, purchased: 0 };
  return {
    usage: Math.abs(Number(first.usage) || 0),
    purchased: Number(first.purchased) || 0,
  };
}

export async function getWorkspaceBillingActivity(
  userId: string,
  workspaceId: string,
  query: BillingActivityQuery = {},
): Promise<WorkspaceBillingActivity | WorkspaceBillingActivityError> {
  await requireWorkspaceAccess({ user: { id: userId }, workspaceId });

  const balance = await getWorkspaceCreditsBalance(workspaceId);
  if (balance == null) {
    return { ok: false, error: "Workspace not found", status: 404 };
  }

  const page = Math.max(1, Math.trunc(Number(query.page ?? 1)) || 1);
  const filter = query.filter ?? "all";
  const offset = (page - 1) * BILLING_ACTIVITY_LIMIT;
  const where = ledgerWhereFor(filter);

  const tdb = createTenantDb(workspaceId);
  const [ledger, totalCount, totals] = await Promise.all([
    tdb.transaction_history.findMany({
      columns: {
        id: true,
        created_at: true,
        type: true,
        amount: true,
        note: true,
        idempotency_key: true,
        campaign_id: true,
        message_sid: true,
        call_sid: true,
      },
      where,
      orderBy: (row, { desc }) => [desc(row.created_at)],
      limit: BILLING_ACTIVITY_LIMIT,
      offset,
    }),
    tdb.transaction_history.count({ where }),
    loadLedgerTotals(tdb, workspaceId),
  ]);

  const [messages, calls] = await Promise.all([
    lookupMessageCampaigns(tdb, unattributedSids(ledger, "message_sid")),
    lookupCallCampaigns(tdb, unattributedSids(ledger, "call_sid")),
  ]);
  const history = attributeLedgerCampaigns(ledger, { messages, calls });
  const campaignNames = await lookupCampaignNames(tdb, history);

  return {
    ok: true,
    balance,
    history,
    campaignNames,
    page,
    pageSize: BILLING_ACTIVITY_LIMIT,
    totalCount,
    totals,
  };
}
