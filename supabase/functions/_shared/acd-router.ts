import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
export type { QueueRecord, TwilioCredentials } from "./acd-utils.ts";
export { buildAgentBridgeTwiml, buildHoldMusicTwiml, makeQueueName, parseQueueIdFromName } from "./acd-utils.ts";
import { buildHoldMusicTwiml, makeQueueName, type QueueRecord, type TwilioCredentials } from "./acd-utils.ts";
import { readTwilioWorkspaceCredentials } from "./twilio-workspace-credentials.ts";

export const INBOUND_OFFER_TIMEOUT_SECONDS = 25;
export const POLL_INTERVAL_MS = 3000;

export async function lookupQueue(
  supabase: SupabaseClient,
  queueId: number,
): Promise<QueueRecord | null> {
  const { data } = await supabase
    .from("inbound_queue")
    .select("id, workspace_id, name, hold_audio")
    .eq("id", queueId)
    .maybeSingle();
  return data;
}

export async function loadWorkspaceTwilioCredentials(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<TwilioCredentials | null> {
  const { data } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .maybeSingle() as { data: { twilio_data: Record<string, unknown> | null } | null };

  const creds = readTwilioWorkspaceCredentials(data?.twilio_data);
  if (!creds) return null;
  return { accountSid: creds.sid, authToken: creds.authToken };
}

export async function claimAgentForQueue(args: {
  supabase: SupabaseClient;
  queueId: number;
  workspaceId: string;
  callSid: string;
  callerNumber: string;
}): Promise<{ agentUserId: string; entryId: number } | null> {
  const { data, error } = await args.supabase.rpc("claim_inbound_queue_entry", {
    p_queue_id: args.queueId,
    p_workspace_id: args.workspaceId,
    p_call_sid: args.callSid,
    p_caller_number: args.callerNumber,
  });
  if (error) {
    console.error("claim_inbound_queue_entry RPC error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return { agentUserId: data[0].agent_user_id, entryId: data[0].entry_id };
}

export async function dialAgent(args: {
  twilioCredentials: TwilioCredentials;
  agentUserId: string;
  queueId: number;
  entryId: number;
  baseUrl: string;
  workspaceId: string;
  callerNumber: string;
}): Promise<void> {
  const { default: twilio } = await import("npm:twilio@^4.23.0");
  const client = twilio(args.twilioCredentials.accountSid, args.twilioCredentials.authToken);
  const queueName = makeQueueName(args.queueId);
  const agentBridgeUrl = `${args.baseUrl}/functions/v1/acd-router/agent-bridge?queue_name=${queueName}&entry_id=${args.entryId}`;
  const agentStatusUrl = `${args.baseUrl}/functions/v1/acd-router/agent-status?entry_id=${args.entryId}&queue_id=${args.queueId}`;

  try {
    await client.calls.create({
      to: `client:agent_${args.agentUserId.replace(/-/g, "_")}`,
      from: args.callerNumber,
      url: agentBridgeUrl,
      statusCallback: agentStatusUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      timeout: INBOUND_OFFER_TIMEOUT_SECONDS,
    });
  } catch (error) {
    console.error("Failed to dial agent", {
      agentUserId: args.agentUserId,
      entryId: args.entryId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function releaseAgent(
  supabase: SupabaseClient,
  entryId: number,
  outcome: "timed_out" | "declined" = "timed_out",
): Promise<void> {
  const { error } = await supabase.rpc("release_inbound_offer", {
    p_entry_id: entryId,
    p_outcome: outcome,
  });
  if (error) {
    console.error("release_inbound_offer RPC error", error);
  }
}

export async function nextQueueOffer(args: {
  supabase: SupabaseClient;
  queueId: number;
  agentUserId: string;
  workspaceId: string;
}): Promise<{ callSid: string; entryId: number } | null> {
  const { data, error } = await args.supabase.rpc("next_inbound_queue_offer", {
    p_queue_id: args.queueId,
    p_agent_user_id: args.agentUserId,
    p_workspace_id: args.workspaceId,
  });
  if (error) {
    console.error("next_inbound_queue_offer RPC error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return { callSid: data[0].call_sid, entryId: data[0].entry_id };
}
