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

export function billingUnitsFromDurationSeconds(durationSeconds: number): number {
  const seconds = Number.isFinite(durationSeconds) ? durationSeconds : 0;
  const units = Math.floor(Math.max(0, seconds) / 60) + 1;
  return -units;
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
        "*, outreach_attempt(id, result, current_step), campaign(*,ivr_campaign(*, script(*)))",
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
}

export async function insertTransactionHistoryIdempotent(args: {
  supabase: SupabaseLike;
  workspaceId: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  idempotencyKey: string;
}): Promise<{ inserted: boolean }> {
  const marker = `[idempotency:${args.idempotencyKey}]`;
  const noteWithMarker = args.note.includes(marker)
    ? args.note
    : `${args.note} ${marker}`;

  return withTransactionHistoryInsertLock(
    `${args.workspaceId}:${args.type}:${args.idempotencyKey}`,
    async () => {
      try {
        const { data: existing, error: existingError } = (await args.supabase
          .from("transaction_history")
          .select("id")
          .eq("workspace", args.workspaceId)
          .eq("type", args.type)
          .like("note", `%${marker}%`)
          .limit(1)) as Awaited<SupabaseArrayResult<{ id: number }>>;

        if (!existingError && existing && existing.length > 0) {
          return { inserted: false };
        }

        const { error } = (await args.supabase.from("transaction_history").insert({
          workspace: args.workspaceId,
          type: args.type,
          amount: args.amount,
          note: noteWithMarker,
        })) as Awaited<SupabaseSingleResult<any>>;

        if (error) {
          console.error("transaction_history insert failed", { error, noteWithMarker });
          throw error;
        }

        return { inserted: true };
      } catch (error) {
        console.error("transaction_history idempotent insert error", error);
        throw error;
      }
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
    // Allow call to proceed if we can't check credits (preserve existing behavior).
    return true;
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

