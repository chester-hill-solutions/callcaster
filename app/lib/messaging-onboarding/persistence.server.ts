import type { Database } from "@/lib/db-types";
import type { TwilioAccountData, WorkspaceMessagingOnboardingState } from "@/lib/types";
import { isObject } from "@/lib/type-safety-utils";
import { normalizeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/normalize.server";
import { mergeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/merge.server";
import {
  loadWorkspaceTwilioData,
  persistWorkspaceTwilioData,
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
  const currentTwilioData = await loadWorkspaceTwilioData(workspaceId);
  const currentState = getWorkspaceMessagingOnboardingFromTwilioData(
    currentTwilioData as TwilioAccountData,
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

  await persistWorkspaceTwilioData(workspaceId, nextTwilioData);

  return nextState;
}
