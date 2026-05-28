import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import {
  claimBatchSizeForRate,
  configuredDispatcherSmsMps,
  configuredDispatcherVoiceCps,
  normalizePortalThroughputConfig,
  type WorkspaceThroughputPortalConfig,
} from "./throughput-config.ts";
import {
  DISPATCH_TICK_MS,
  type RequeueResult,
} from "./queue-policy.ts";

export type DispatchMode = "legacy" | "parallel";

export type ClaimedContact = {
  id: number;
  contact_id: number;
  phone: string;
  workspace: string;
  caller_id: string | null;
};

export async function loadWorkspaceThroughputConfig(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceThroughputPortalConfig> {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePortalThroughputConfig(data?.twilio_data ?? null);
}

export async function resetStaleClaims(
  supabase: SupabaseClient,
  campaignId: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("reset_stale_campaign_queue_claims", {
    campaign_id_pro: campaignId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function campaignHasPendingWork(
  supabase: SupabaseClient,
  campaignId: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("campaign_queue_has_pending_work", {
    campaign_id_pro: campaignId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function countActiveIvrCampaignCalls(
  supabase: SupabaseClient,
  campaignId: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_active_ivr_campaign_calls", {
    campaign_id_pro: campaignId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export function resolveDispatchMode(
  config: WorkspaceThroughputPortalConfig,
): DispatchMode {
  return config.parallelDispatchEnabled ? "parallel" : "legacy";
}

export function resolveClaimLimit(args: {
  campaignType: string;
  config: WorkspaceThroughputPortalConfig;
}): number {
  if (args.campaignType === "message") {
    return claimBatchSizeForRate(configuredDispatcherSmsMps(args.config));
  }
  if (args.campaignType === "robocall") {
    return claimBatchSizeForRate(configuredDispatcherVoiceCps(args.config));
  }
  return 1;
}

export function resolveIvrClaimLimit(args: {
  config: WorkspaceThroughputPortalConfig;
  activeCalls: number;
}): number {
  const rateLimit = resolveClaimLimit({
    campaignType: "robocall",
    config: args.config,
  });
  const headroom = Math.max(
    0,
    args.config.voiceConcurrentCallLimit - args.activeCalls,
  );
  if (headroom <= 0) {
    return 0;
  }
  return Math.min(rateLimit, headroom);
}

export async function scheduleNextDispatch(args: {
  fetchImpl: typeof fetch;
  queueNextUrl: string;
  headers: Record<string, string>;
  campaignId: number;
  owner: string | null;
  delayMs?: number;
}): Promise<void> {
  const delayMs = args.delayMs ?? DISPATCH_TICK_MS;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await args.fetchImpl(args.queueNextUrl, {
    method: "POST",
    headers: args.headers,
    body: JSON.stringify({
      campaign_id: args.campaignId,
      owner: args.owner,
    }),
  }).catch((error) => {
    console.error("Failed to schedule next queue-next dispatch", {
      campaignId: args.campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function markCampaignCompleteIfDrained(args: {
  supabase: SupabaseClient;
  campaignId: number;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_complete_campaign_if_drained", {
    campaign_id_pro: args.campaignId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function requeueContact(args: {
  supabase: SupabaseClient;
  queueId: number;
  errorText?: string | null;
}): Promise<RequeueResult> {
  const { data, error } = await supabase.rpc("requeue_campaign_queue_contact", {
    queue_id_pro: args.queueId,
    error_text: args.errorText ?? null,
  });
  if (error) throw error;
  const result = String(data ?? "requeued");
  if (
    result === "requeued" ||
    result === "failed_max_attempts" ||
    result === "not_found"
  ) {
    return result;
  }
  return "requeued";
}

export async function failQueueContact(args: {
  supabase: SupabaseClient;
  queueId: number;
  errorText?: string | null;
  dequeuedById?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("fail_campaign_queue_contact", {
    queue_id_pro: args.queueId,
    error_text: args.errorText ?? null,
    dequeued_by_id: args.dequeuedById ?? null,
  });
  if (error) throw error;
}

export async function completeQueueContact(args: {
  supabase: SupabaseClient;
  queueId: number;
  dequeuedById?: string | null;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("complete_campaign_queue_contact", {
    queue_id_pro: args.queueId,
    dequeued_by_id: args.dequeuedById ?? null,
    reason_text: args.reason ?? "Dispatched",
  });
  if (error) throw error;
}

export async function dequeueDuplicateQueueContact(args: {
  supabase: SupabaseClient;
  queueId: number;
  dequeuedById?: string | null;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("dequeue_duplicate_campaign_queue_contact", {
    queue_id_pro: args.queueId,
    dequeued_by_id: args.dequeuedById ?? null,
    reason_text: args.reason ?? "Duplicate SMS prevented",
  });
  if (error) throw error;
}

export async function claimCampaignQueueContacts(args: {
  supabase: SupabaseClient;
  campaignId: number;
  owner: string | null;
  claimLimit: number;
  maxInflight?: number | null;
}): Promise<ClaimedContact[]> {
  const { data, error } = await supabase.rpc("claim_campaign_queue_contacts", {
    campaign_id_pro: args.campaignId,
    claimed_by_user_id: args.owner,
    claim_limit: args.claimLimit,
    max_inflight: args.maxInflight ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ClaimedContact[];
}
