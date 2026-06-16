import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { getWorkspacePhoneNumbers } from "@/lib/database.server";
import { hydrateWorkspaceRcsOnboardingState } from "@/lib/rcs-onboarding.server";

export async function persistWorkspaceOnboardingState(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
  updates: Partial<WorkspaceMessagingOnboardingState>;
  hydrateRcs?: boolean;
}) {
  const { supabaseClient, workspaceId, actorUserId, updates, hydrateRcs = true } = args;

  const [phoneNumbers, current] = await Promise.all([
    getWorkspacePhoneNumbers({ supabaseClient, workspaceId }),
    getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
  ]);

  let merged = mergeWorkspaceMessagingOnboardingState(current, updates);
  if (hydrateRcs) {
    merged = hydrateWorkspaceRcsOnboardingState(merged);
  }

  const withSteps = applyOnboardingStepsWithWorkspaceNumbers(
    merged,
    phoneNumbers.data ?? [],
  );

  return updateWorkspaceMessagingOnboardingState({
    supabaseClient,
    workspaceId,
    updates: withSteps,
    actorUserId,
  });
}
