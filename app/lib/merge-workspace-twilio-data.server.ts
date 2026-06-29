import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isObject } from "@/lib/type-safety-utils";

export type WorkspaceTwilioData = Record<string, unknown>;

export async function loadWorkspaceTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
): Promise<WorkspaceTwilioData> {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  return isObject(data?.twilio_data) ? data.twilio_data : {};
}

export async function persistWorkspaceTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  twilioData: WorkspaceTwilioData,
): Promise<void> {
  const { error } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data:
        twilioData as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (error) {
    throw error;
  }
}

export async function mergeWorkspaceTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  updater: (current: WorkspaceTwilioData) => WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  const current = await loadWorkspaceTwilioData(supabaseClient, workspaceId);
  const next = updater(current);
  await persistWorkspaceTwilioData(supabaseClient, workspaceId, next);
  return next;
}

export async function patchWorkspaceTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  patch: WorkspaceTwilioData,
): Promise<WorkspaceTwilioData> {
  return mergeWorkspaceTwilioData(supabaseClient, workspaceId, (current) => ({
    ...current,
    ...patch,
  }));
}
