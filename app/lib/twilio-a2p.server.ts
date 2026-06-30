import type { Database } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import {
  evaluateWorkspaceReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
  type WorkspaceReadinessContext,
} from "@/lib/messaging-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import {
  loadWorkspaceTwilioData,
  persistWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
} from "@/lib/types";
import { parseOptionalString } from "@/lib/parse-utils.server";

async function loadWorkspaceTwilioContext(
  workspaceId: string,
) {
  const twilioData = (await loadWorkspaceTwilioData(workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  const twilio = await createWorkspaceTwilioInstance({     workspace_id: workspaceId,
  });

  return {
    twilioData,
    onboarding,
    twilio,
  };
}

async function persistOnboardingState({
  workspaceId,
  twilioData,
  onboarding,
}: {
  null?: never | null;
  workspaceId: string;
  twilioData: TwilioAccountData;
  onboarding: WorkspaceMessagingOnboardingState;
}) {
  await persistWorkspaceTwilioData(workspaceId, {
    ...(twilioData as Record<string, unknown>),
    onboarding,
  });
}

export function buildA2pBlockingIssues(onboarding: WorkspaceMessagingOnboardingState) {
  const ctx: WorkspaceReadinessContext = {
    onboarding,
    workspaceNumbers: [],
  };
  const results = evaluateWorkspaceReadiness(ctx, {
    forChannel: "a2p10dlc",
    exclude: ["a2p_approved"],
    messageOverrides: {
      messaging_service_not_provisioned: "Messaging Service must be provisioned first.",
    },
  });
  return results.map((result) => result.message);
}

export async function provisionWorkspaceA2P({
  workspaceId,
  actorUserId,
}: {
  workspaceId: string;
  actorUserId: string | null;
}) {
  const bootstrap = await ensureWorkspaceTwilioBootstrap({
    workspaceId,
    actorUserId,
  });
  if (bootstrap.outcome === "failed" || !bootstrap.serviceSid) {
    throw new Error(
      bootstrap.lastError ?? "Messaging Service must be provisioned before A2P registration.",
    );
  }

  const { twilioData, onboarding, twilio } = await loadWorkspaceTwilioContext(workspaceId,
  );

  const blockingIssues = buildA2pBlockingIssues(onboarding);
  if (blockingIssues.length > 0) {
    const blockedState = mergeWorkspaceMessagingOnboardingState(onboarding, {
      status: "collecting_business",
      currentStep: "business_profile",
      reviewState: {
        ...onboarding.reviewState,
        blockingIssues,
        lastUpdatedAt: new Date().toISOString(),
      },
      a2p10dlc: {
        ...onboarding.a2p10dlc,
        status: "collecting_business",
        rejectionReason: null,
      },
      lastUpdatedBy: actorUserId,
    });
    await persistOnboardingState({
      workspaceId,
      twilioData,
      onboarding: blockedState,
    });
    return blockedState;
  }

  let nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    status: "submitting",
    currentStep: "provider_provisioning",
    a2p10dlc: {
      ...onboarding.a2p10dlc,
      status: "submitting",
      lastSubmittedAt: new Date().toISOString(),
    },
    reviewState: {
      ...onboarding.reviewState,
      blockingIssues: [],
      lastError: null,
      lastUpdatedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });

  try {
    const messagingApi = (twilio as any).messaging?.v1;
    let brandSid = nextOnboarding.a2p10dlc.brandSid;
    let campaignSid = nextOnboarding.a2p10dlc.campaignSid;

    if (!brandSid && messagingApi?.brandRegistrations?.create) {
      const brand = await messagingApi.brandRegistrations.create({
        customerProfileBundleSid:
          nextOnboarding.a2p10dlc.customerProfileBundleSid!,
        a2PProfileBundleSid: nextOnboarding.a2p10dlc.trustProductSid!,
        ...(nextOnboarding.a2p10dlc.brandType
          ? { brandType: nextOnboarding.a2p10dlc.brandType }
          : {}),
      });
      brandSid = parseOptionalString(brand?.sid);
    }

    if (
      !campaignSid &&
      brandSid &&
      nextOnboarding.messagingService.serviceSid &&
      messagingApi?.campaigns?.create
    ) {
      const campaign = await messagingApi.campaigns.create({
        brandRegistrationSid: brandSid,
        messagingServiceSid: nextOnboarding.messagingService.serviceSid,
        usecaseDescription: nextOnboarding.businessProfile.useCaseSummary,
      });
      campaignSid = parseOptionalString(campaign?.sid);
    }

    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: brandSid ? "in_review" : "submitting",
      a2p10dlc: {
        ...nextOnboarding.a2p10dlc,
        brandSid,
        campaignSid,
        status: brandSid ? "in_review" : "submitting",
        lastSyncedAt: new Date().toISOString(),
      },
    });
  } catch (a2pError) {
    logger.error("Error provisioning workspace A2P registration:", a2pError);
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: "rejected",
      a2p10dlc: {
        ...nextOnboarding.a2p10dlc,
        status: "rejected",
        rejectionReason:
          a2pError instanceof Error ? a2pError.message : "Unknown A2P error",
      },
      reviewState: {
        ...nextOnboarding.reviewState,
        lastError:
          a2pError instanceof Error ? a2pError.message : "Unknown A2P error",
        lastUpdatedAt: new Date().toISOString(),
      },
    });
  }

  await persistOnboardingState({
    workspaceId,
    twilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}

export async function syncWorkspaceA2PStatus({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { twilioData, onboarding } = await loadWorkspaceTwilioContext(workspaceId,
  );

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    a2p10dlc: {
      ...onboarding.a2p10dlc,
      lastSyncedAt: new Date().toISOString(),
    },
  });

  await persistOnboardingState({
    workspaceId,
    twilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}
