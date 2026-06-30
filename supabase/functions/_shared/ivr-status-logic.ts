export const TERMINAL_OUTREACH_DISPOSITIONS_LIST = [
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
  "cancelled",
  "voicemail",
  "voicemail-no-message",
  "delivered",
  "undelivered",
] as const;

export const TERMINAL_OUTREACH_DISPOSITIONS = new Set<string>(
  TERMINAL_OUTREACH_DISPOSITIONS_LIST,
);

export function canTransitionOutreachDisposition(
  current: string | null | undefined,
  next: string,
): boolean {
  if (!current) return true;
  const c = String(current).toLowerCase();
  const n = String(next).toLowerCase();
  return !(TERMINAL_OUTREACH_DISPOSITIONS.has(c) && c !== n);
}

import {
  debitAmountFromCredits,
  voiceCreditsFromDurationSeconds,
  type VoiceBillingKind,
} from "../../../shared/pricing.ts";

export { voiceBillingKindFromCampaignType, type VoiceBillingKind } from "../../../shared/pricing.ts";

export function billingUnitsFromDurationSeconds(
  durationSeconds: number,
  kind: VoiceBillingKind,
): number {
  return debitAmountFromCredits(
    voiceCreditsFromDurationSeconds(durationSeconds, kind),
  );
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const transactionHistoryInsertLocks = new Map<string, Promise<void>>();

async function withTransactionHistoryInsertLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = transactionHistoryInsertLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  transactionHistoryInsertLocks.set(key, queued);

  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (transactionHistoryInsertLocks.get(key) === queued) {
      transactionHistoryInsertLocks.delete(key);
    }
  }
}

type SupabaseSingleResult<T> = Promise<{ data: T | null; error: any }>;
type SupabaseArrayResult<T> = Promise<{ data: T[] | null; error: any }>;

export type SupabaseLike = {
  from: (table: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export async function getCallWithRetry<TCall = any>(
  supabase: SupabaseLike,
  callSid: string,
  opts?: { maxRetries?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<TCall> {
  const maxRetries = opts?.maxRetries ?? 5;
  const retryDelayMs = opts?.retryDelayMs ?? 200;
  const sleep = opts?.sleep ?? sleepMs;

  let attempt = 0;
  let shouldRetry = true;
  while (shouldRetry) {
    const { data, error } = (await supabase
      .from("call")
      .select(
        "*, outreach_attempt(id, result, current_step), campaign(*, script:script(*))",
      )
      .eq("sid", callSid)
      .single()) as Awaited<SupabaseSingleResult<TCall>>;

    if (!error && data) return data;
    if (attempt >= maxRetries) {
      shouldRetry = false;
      throw new Error("Failed to retrieve call after multiple attempts");
    }
    attempt++;
    await sleep(retryDelayMs);
  }
  throw new Error("Failed to retrieve call after multiple attempts");
}

export async function insertTransactionHistoryIdempotent(args: {
  supabase: SupabaseLike;
  workspaceId: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  idempotencyKey: string;
  campaignId?: number | null;
  callSid?: string | null;
  messageSid?: string | null;
}): Promise<{ inserted: boolean }> {
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required for transaction history insert");
  }

  return withTransactionHistoryInsertLock(
    `${args.workspaceId}:${args.type}:${idempotencyKey}`,
    async () => {
      const { data, error } = (await (args.supabase as any).rpc(
        "apply_ledger_entry_and_sync_credits",
        {
          p_workspace_id: args.workspaceId,
          p_type: args.type,
          p_amount: args.amount,
          p_idempotency_key: idempotencyKey,
          p_description: args.note,
          p_campaign_id: args.campaignId ?? null,
          p_call_sid: args.callSid ?? null,
          p_message_sid: args.messageSid ?? null,
        },
      )) as { data: { id: number; inserted: boolean } | null; error: any };

      if (!error && data?.id) {
        console.info(
          "billing.transaction",
          JSON.stringify({
            workspaceId: args.workspaceId,
            type: args.type,
            amount: args.amount,
            idempotencyKey,
            inserted: data.inserted,
          }),
        );
        return { inserted: data.inserted };
      }

      console.error("transaction_history RPC failed", {
        error,
        workspaceId: args.workspaceId,
        idempotencyKey,
      });
      throw error ?? new Error("apply_ledger_entry_and_sync_credits returned no row");
    },
  );
}

export async function checkWorkspaceCredits(args: {
  supabase: SupabaseLike;
  workspaceId: string;
  campaignId: string | number;
  callSid: string;
  twilioClient: { calls: (sid: string) => { update: (args: any) => Promise<any> } };
}): Promise<boolean> {
  const { data: workspaceCredits, error: workspaceCreditsError } = (await args.supabase
    .from("workspace")
    .select("credits")
    .eq("id", args.workspaceId)
    .single()) as Awaited<SupabaseSingleResult<{ credits: number }>>;

  if (workspaceCreditsError) {
    console.error("Failed to check workspace credits; blocking call", {
      workspaceId: args.workspaceId,
      error: workspaceCreditsError,
    });
    return false;
  }

  if ((workspaceCredits?.credits ?? 0) <= 0) {
    await args.supabase
      .from("campaign")
      .update({ is_active: false })
      .eq("id", args.campaignId);

    try {
      await args.twilioClient.calls(args.callSid).update({ status: "canceled" });
    } catch {
      // best-effort cancellation
    }
    return false;
  }

  return true;
}

