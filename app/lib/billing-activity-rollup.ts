import { bucketFromIdempotencyKey } from "../../shared/billing-keys";
import type { BillingActivityRow } from "@/lib/billing-activity-projection";
import { projectBillingActivity } from "@/lib/billing-activity-projection";

/**
 * Groups campaign usage debits (SMS, voice, AI) by campaign and calendar
 * month. Purchases, number rentals, credits, debits without a campaign id,
 * and lone entries are passed through ungrouped.
 */

export type BillingActivityEntryItem = {
  kind: "entry";
  row: BillingActivityRow;
};

export type BillingActivityGroupItem = {
  kind: "group";
  key: string;
  campaignId: number;
  campaignName: string;
  periodKey: string;
  periodLabel: string;
  /** ISO timestamps of the earliest and latest entries in the group. */
  firstAt: string;
  lastAt: string;
  entryCount: number;
  /** Signed sum of the grouped amounts (negative for usage). */
  totalAmount: number;
  /** Distinct activity labels in the group, e.g. "SMS messaging". */
  activities: string[];
  /** Underlying ledger rows, newest first. */
  entries: BillingActivityRow[];
};

export type BillingActivityItem =
  | BillingActivityEntryItem
  | BillingActivityGroupItem;

export type BillingPeriod = { key: string; label: string };

export type RollUpOptions = {
  /** Campaign id → display title. Missing ids fall back to "Campaign <id>". */
  campaignNames?: Readonly<Record<number, string>>;
  /** Defaults to the local calendar month so it agrees with the displayed dates. */
  periodOf?: (createdAt: string) => BillingPeriod;
};

const USAGE_BUCKETS = new Set(["sms", "voice", "ai"]);

export function localMonthPeriod(createdAt: string): BillingPeriod {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return { key: "unknown", label: "Unknown period" };
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return {
    key: `${date.getFullYear()}-${month}`,
    label: date.toLocaleString("en-CA", { month: "long", year: "numeric" }),
  };
}

export function campaignDisplayName(
  campaignId: number,
  campaignNames: Readonly<Record<number, string>> | undefined,
): string {
  const title = campaignNames?.[campaignId]?.trim();
  return title ? title : `Campaign ${campaignId}`;
}

function isCampaignUsageDebit(row: BillingActivityRow): row is BillingActivityRow & {
  campaign_id: number;
} {
  if (row.type !== "DEBIT") return false;
  if (row.campaign_id == null) return false;
  return USAGE_BUCKETS.has(bucketFromIdempotencyKey(row.idempotency_key));
}

function timeOf(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function latestTime(item: BillingActivityItem): number {
  return timeOf(item.kind === "group" ? item.lastAt : item.row.created_at);
}

function buildGroup(
  key: string,
  rows: BillingActivityRow[],
  campaignId: number,
  period: BillingPeriod,
  campaignNames: RollUpOptions["campaignNames"],
): BillingActivityGroupItem | null {
  const entries = [...rows].sort(
    (a, b) => timeOf(b.created_at) - timeOf(a.created_at),
  );
  const newest = entries[0];
  const oldest = entries[entries.length - 1];
  if (!newest || !oldest) return null;
  const activities = Array.from(
    new Set(entries.map((row) => projectBillingActivity(row).activity)),
  );
  return {
    kind: "group",
    key,
    campaignId,
    campaignName: campaignDisplayName(campaignId, campaignNames),
    periodKey: period.key,
    periodLabel: period.label,
    firstAt: oldest.created_at,
    lastAt: newest.created_at,
    entryCount: entries.length,
    totalAmount: entries.reduce((sum, row) => sum + row.amount, 0),
    activities,
    entries,
  };
}

export function rollUpBillingActivity(
  rows: readonly BillingActivityRow[],
  options: RollUpOptions = {},
): BillingActivityItem[] {
  const periodOf = options.periodOf ?? localMonthPeriod;
  const buckets = new Map<
    string,
    { campaignId: number; period: BillingPeriod; rows: BillingActivityRow[] }
  >();
  const items: BillingActivityItem[] = [];

  for (const row of rows) {
    if (!isCampaignUsageDebit(row)) {
      items.push({ kind: "entry", row });
      continue;
    }
    const period = periodOf(row.created_at);
    const key = `campaign:${row.campaign_id}:${period.key}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      buckets.set(key, { campaignId: row.campaign_id, period, rows: [row] });
    }
  }

  for (const [key, bucket] of buckets) {
    const [only] = bucket.rows;
    if (bucket.rows.length === 1 && only) {
      items.push({ kind: "entry", row: only });
      continue;
    }
    const group = buildGroup(
      key,
      bucket.rows,
      bucket.campaignId,
      bucket.period,
      options.campaignNames,
    );
    if (group) items.push(group);
  }

  return items.sort((a, b) => latestTime(b) - latestTime(a));
}
