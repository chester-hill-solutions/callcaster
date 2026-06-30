import {
  debitAmountFromCredits,
  voiceCreditsFromDurationSeconds,
  type VoiceBillingKind,
} from "./pricing.ts";

export {
  voiceBillingKindFromCampaignType,
  type VoiceBillingKind,
} from "./pricing.ts";

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

type PostgresSingleResult<T> = Promise<{ data: T | null; error: unknown }>;

export type DbClientLike = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (col: string, val: unknown) => {
        single: () => PostgresSingleResult<unknown>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<{
    data: { id: number; inserted: boolean } | null;
    error: unknown;
  }>;
};

export async function getCallWithRetry<TCall = Record<string, unknown>>(
  client: DbClientLike,
  callSid: string,
  opts?: {
    maxRetries?: number;
    retryDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<TCall> {
  const maxRetries = opts?.maxRetries ?? 5;
  const retryDelayMs = opts?.retryDelayMs ?? 200;
  const sleep = opts?.sleep ?? sleepMs;

  let attempt = 0;
  while (attempt <= maxRetries) {
    const { data, error } = (await client
      .from("call")
      .select(
        "*, outreach_attempt(id, result, current_step), campaign(*, script:script(*))",
      )
      .eq("sid", callSid)
      .single()) as Awaited<PostgresSingleResult<TCall>>;

    if (!error && data) return data;
    if (attempt >= maxRetries) {
      throw new Error("Failed to retrieve call after multiple attempts");
    }
    attempt++;
    await sleep(retryDelayMs);
  }
  throw new Error("Failed to retrieve call after multiple attempts");
}

export async function checkWorkspaceCredits(args: {
  client: DbClientLike;
  workspaceId: string;
  campaignId: string | number;
  callSid: string;
  twilioClient: {
    calls: (sid: string) => { update: (args: { status: string }) => Promise<unknown> };
  };
}): Promise<boolean> {
  const { data: workspaceCredits, error: workspaceCreditsError } = (await args.client
    .from("workspace")
    .select("credits")
    .eq("id", args.workspaceId)
    .single()) as Awaited<PostgresSingleResult<{ credits: number }>>;

  if (workspaceCreditsError) {
    return false;
  }

  if ((workspaceCredits?.credits ?? 0) <= 0) {
    await args.client
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
