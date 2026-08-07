import type { Database } from "@/lib/db-types";
import type { TwilioAccountData, WorkspaceMessagingOnboardingState } from "@/lib/types";
import { isObject } from "@/lib/type-safety-utils";
import { normalizeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/normalize.server";
import { mergeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/merge.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";

export function getWorkspaceMessagingOnboardingFromTwilioData(
  twilioData: TwilioAccountData | unknown,
): WorkspaceMessagingOnboardingState {
  if (!isObject(twilioData)) {
    return normalizeWorkspaceMessagingOnboardingState(null);
  }

  return normalizeWorkspaceMessagingOnboardingState(twilioData.onboarding);
}

export async function getWorkspaceMessagingOnboardingState({workspaceId,
}: {
  null?: never | null;
  workspaceId: string;
}) {
  const twilioData = await loadWorkspaceTwilioData(workspaceId);
  return getWorkspaceMessagingOnboardingFromTwilioData(twilioData as TwilioAccountData);
}

export async function updateWorkspaceMessagingOnboardingState({workspaceId,
  updates,
  actorUserId,
}: {
  null?: never | null;
  workspaceId: string;
  updates: Partial<WorkspaceMessagingOnboardingState>;
  actorUserId: string | null;
}) {
  // Re-derive the current onboarding state from the FRESH row inside the atomic
  // merge, so a concurrent write (e.g. the compliance job persisting a brandSid)
  // is not clobbered by a stale-cache read-modify-write.
  let nextState: WorkspaceMessagingOnboardingState | undefined;
  await mergeWorkspaceTwilioData(workspaceId, (current) => {
    const currentState = getWorkspaceMessagingOnboardingFromTwilioData(
      current as TwilioAccountData,
    );
    nextState = mergeWorkspaceMessagingOnboardingState(currentState, {
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: actorUserId,
    });
    return {
      ...current,
      onboarding: nextState,
    };
  });

  return nextState!;
}
