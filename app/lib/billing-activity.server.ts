import { inArray } from "drizzle-orm";
import {
  call as callTable,
  campaign as campaignTable,
  message as messageTable,
} from "@/db/schema";
import type { BillingActivityRow } from "@/lib/billing-activity-projection";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import type { TransactionType } from "@/lib/transaction-history-display";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export const BILLING_ACTIVITY_LIMIT = 500;

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
};

export type WorkspaceBillingActivityError = {
  ok: false;
  error: string;
  status: number;
};

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

export async function getWorkspaceBillingActivity(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceBillingActivity | WorkspaceBillingActivityError> {
  await requireWorkspaceAccess({ user: { id: userId }, workspaceId });

  const balance = await getWorkspaceCreditsBalance(workspaceId);
  if (balance == null) {
    return { ok: false, error: "Workspace not found", status: 404 };
  }

  const tdb = createTenantDb(workspaceId);
  const ledger = (await tdb.transaction_history.findMany({
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
    orderBy: (row, { desc }) => [desc(row.created_at)],
    limit: BILLING_ACTIVITY_LIMIT,
  })) as LedgerActivityRow[];

  const [messages, calls] = await Promise.all([
    lookupMessageCampaigns(tdb, unattributedSids(ledger, "message_sid")),
    lookupCallCampaigns(tdb, unattributedSids(ledger, "call_sid")),
  ]);
  const history = attributeLedgerCampaigns(ledger, { messages, calls });
  const campaignNames = await lookupCampaignNames(tdb, history);

  return { ok: true, balance, history, campaignNames };
}
