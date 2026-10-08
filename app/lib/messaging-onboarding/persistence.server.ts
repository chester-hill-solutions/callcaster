import type { Database } from "@/lib/db-types";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingOnboardingUpdates,
} from "@/lib/types";
import { isObject } from "@/lib/type-safety-utils";
import { a2pBusinessProfileChanged } from "@/lib/a2p-messaging-profile.server";
import { normalizeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/normalize.server";
import { mergeWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding/merge.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
  type TwilioDataExecutor,
} from "@/lib/merge-workspace-twilio-data.server";

export function getWorkspaceMessagingOnboardingFromTwilioData(
  twilioData: TwilioAccountData | unknown,
): WorkspaceMessagingOnboardingState {
  if (!isObject(twilioData)) {
    return normalizeWorkspaceMessagingOnboardingState(null);
  }

  return normalizeWorkspaceMessagingOnboardingState(twilioData.onboarding);
}

export async function getWorkspaceMessagingOnboardingState({workspaceId, transaction,
}: {
  null?: never | null;
  workspaceId: string;
  transaction?: TwilioDataExecutor;
}) {
  const twilioData = await loadWorkspaceTwilioData(workspaceId, transaction);
  return getWorkspaceMessagingOnboardingFromTwilioData(
    twilioData as TwilioAccountData,
  );
}

export async function updateWorkspaceMessagingOnboardingState({workspaceId,
  updates,
  actorUserId,
  transaction,
  expectedA2pBusinessProfile,
  expectedA2pResourceSids,
}: {
  null?: never | null;
  workspaceId: string;
  updates: WorkspaceMessagingOnboardingUpdates;
  actorUserId: string | null;
  transaction?: TwilioDataExecutor;
  expectedA2pBusinessProfile?: WorkspaceMessagingOnboardingState["businessProfile"];
  expectedA2pResourceSids?: {
    trustProductSid: string;
    messagingProfileEndUserSid: string;
  };
}) {
  // Re-derive the current onboarding state from the FRESH row inside the atomic
  // merge, so a concurrent write (e.g. the compliance job persisting a brandSid)
  // is not clobbered by a stale-cache read-modify-write.
  let nextState: WorkspaceMessagingOnboardingState | undefined;
  await mergeWorkspaceTwilioData(
    workspaceId,
    (current) => {
      const currentState = getWorkspaceMessagingOnboardingFromTwilioData(
        current as TwilioAccountData,
      );
      if (
        expectedA2pBusinessProfile &&
        a2pBusinessProfileChanged(
          expectedA2pBusinessProfile,
          currentState.businessProfile,
        )
      ) {
        throw new Error(
          "A2P business information changed during preparation. Retry with the saved information.",
        );
      }
      if (
        expectedA2pResourceSids &&
        (currentState.a2p10dlc.trustProductSid !==
          expectedA2pResourceSids.trustProductSid ||
          currentState.a2p10dlc.messagingProfileEndUserSid !==
            expectedA2pResourceSids.messagingProfileEndUserSid)
      ) {
        throw new Error(
          "A2P Messaging Profile resources changed during preparation. Retry with the saved resources.",
        );
      }
      nextState = mergeWorkspaceMessagingOnboardingState(currentState, {
        ...updates,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: actorUserId,
      });
      return {
        ...current,
        onboarding: nextState,
      };
    },
    transaction,
  );

  return nextState!;
}
