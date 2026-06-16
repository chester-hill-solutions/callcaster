import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TwilioAccountData, WorkspaceMessagingOnboardingState } from "@/lib/types";
import { isRecord } from "@/lib/parse-utils.server";
import { normalizeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/normalize.server";
import { mergeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/merge.server";

export function getWorkspaceMessagingOnboardingFromTwilioData(
  twilioData: TwilioAccountData | unknown,
): WorkspaceMessagingOnboardingState {
  if (!isRecord(twilioData)) {
    return normalizeWorkspaceMessagingOnboardingState(null);
  }

  return normalizeWorkspaceMessagingOnboardingState(twilioData.onboarding);
}

export async function getWorkspaceMessagingOnboardingState({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  return getWorkspaceMessagingOnboardingFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );
}

export async function updateWorkspaceMessagingOnboardingState({
  supabaseClient,
  workspaceId,
  updates,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  updates: Partial<WorkspaceMessagingOnboardingState>;
  actorUserId: string | null;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const currentTwilioData = isRecord(data?.twilio_data) ? data.twilio_data : {};
  const currentState = getWorkspaceMessagingOnboardingFromTwilioData(
    (data?.twilio_data ?? null) as TwilioAccountData,
  );
  const nextState = mergeWorkspaceMessagingOnboardingState(currentState, {
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: actorUserId,
  });

  const nextTwilioData = {
    ...currentTwilioData,
    onboarding: nextState,
  };

  const { error: updateError } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data:
        nextTwilioData as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (updateError) {
    throw updateError;
  }

  return nextState;
}
