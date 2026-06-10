import { SupabaseClient } from "@supabase/supabase-js";
import { Database, Tables } from "@/lib/database.types";
import { getServiceSupabase } from "@/lib/supabase.server";

type AgentState = Database["public"]["Enums"]["agent_state"];

export type AgentStatusResult = Tables<"agent_status"> | null;

export type AgentStatusTransition = {
  from: AgentState;
  to: AgentState;
  reason?: string | null;
};

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  offline: ["available", "away"],
  available: ["busy", "away", "offline", "wrap_up"],
  busy: ["wrap_up", "away", "offline"],
  wrap_up: ["available", "away", "offline"],
  away: ["available", "offline"],
};

function isValidTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function getAgentStatus(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  userId: string,
): Promise<AgentStatusResult> {
  const { data } = await supabaseClient
    .from("agent_status")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function updateAgentStatus(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  userId: string,
  to: AgentState,
  reason?: string | null,
): Promise<{ status: Tables<"agent_status">; transition: AgentStatusTransition } | { error: string }> {
  const current = await getAgentStatus(supabaseClient, workspaceId, userId);
  const from = current?.status ?? "offline";
  const now = new Date().toISOString();

  if (from === to) {
    const { data, error } = await supabaseClient
      .from("agent_status")
      .upsert({
        workspace_id: workspaceId,
        user_id: userId,
        status: to,
        status_reason: reason ?? null,
        status_started_at: current!.status_started_at,
        last_heartbeat_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { status: data, transition: { from, to, reason } };
  }

  if (!isValidTransition(from, to)) {
    return { error: `Invalid transition: ${from} → ${to}` };
  }

  const { data, error: upsertError } = await supabaseClient
    .from("agent_status")
    .upsert({
      workspace_id: workspaceId,
      user_id: userId,
      status: to,
      status_reason: reason ?? null,
      status_started_at: now,
      last_heartbeat_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (upsertError) return { error: upsertError.message };

  const { error: eventError } = await supabaseClient
    .from("agent_status_event")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      from_status: from,
      to_status: to,
      reason: reason ?? null,
    });

  if (eventError) return { error: eventError.message };

  return { status: data, transition: { from, to, reason } };
}

export async function heartbeatAgentStatus(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await supabaseClient
    .from("agent_status")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
}
