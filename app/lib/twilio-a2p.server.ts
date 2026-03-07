import Twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import type { TwilioAccountData, WorkspaceMessagingOnboardingState } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadWorkspaceTwilioContext(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("id, name, twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  if (!workspace?.twilio_data?.sid || !workspace.twilio_data.authToken) {
    throw new Error("Workspace is missing Twilio subaccount credentials");
  }

  const twilio = new Twilio.Twilio(
    workspace.twilio_data.sid,
    workspace.twilio_data.authToken,
  );

  return {
    workspace,
    twilioData,
    onboarding,
    twilio,
  };
}

async function persistOnboardingState({
  supabaseClient,
  workspaceId,
  twilioData,
  onboarding,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  twilioData: TwilioAccountData;
  onboarding: WorkspaceMessagingOnboardingState;
}) {
  const baseData = isRecord(twilioData) ? twilioData : {};
  const { error } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data: {
        ...baseData,
        onboarding,
      } as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (error) {
    throw error;
  }
}

function buildA2pBlockingIssues(onboarding: WorkspaceMessagingOnboardingState) {
  const issues: string[] = [];

  if (!onboarding.businessProfile.legalBusinessName) {
    issues.push("Legal business name is required.");
  }
  if (!onboarding.businessProfile.websiteUrl) {
    issues.push("Website URL is required.");
  }
  if (!onboarding.businessProfile.useCaseSummary) {
    issues.push("Use case summary is required.");
  }
  if (onboarding.businessProfile.sampleMessages.length === 0) {
    issues.push("At least one sample message is required.");
  }
  if (!onboarding.messagingService.serviceSid) {
    issues.push("Messaging Service must be provisioned first.");
  }

  return issues;
}

export async function provisionWorkspaceA2P({
  supabaseClient,
  workspaceId,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
}) {
  await ensureWorkspaceTwilioBootstrap({
    supabaseClient,
    workspaceId,
    actorUserId,
  });

  const { twilioData, onboarding, twilio } = await loadWorkspaceTwilioContext(
    supabaseClient,
    workspaceId,
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
      },
      lastUpdatedBy: actorUserId,
    });
    blockedState.steps = buildOnboardingStepsForState(blockedState);
    await persistOnboardingState({
      supabaseClient,
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
          nextOnboarding.a2p10dlc.customerProfileBundleSid ?? undefined,
        friendlyName: nextOnboarding.businessProfile.legalBusinessName,
        statusCallback: undefined,
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
        status: campaignSid ? "in_review" : brandSid ? "in_review" : "submitting",
        lastSyncedAt: new Date().toISOString(),
      },
      steps: buildOnboardingStepsForState(nextOnboarding),
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
      steps: buildOnboardingStepsForState(nextOnboarding),
    });
  }

  await persistOnboardingState({
    supabaseClient,
    workspaceId,
    twilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}

export async function syncWorkspaceA2PStatus({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { twilioData, onboarding } = await loadWorkspaceTwilioContext(
    supabaseClient,
    workspaceId,
  );

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    a2p10dlc: {
      ...onboarding.a2p10dlc,
      lastSyncedAt: new Date().toISOString(),
    },
  });
  nextOnboarding.steps = buildOnboardingStepsForState(nextOnboarding);

  await persistOnboardingState({
    supabaseClient,
    workspaceId,
    twilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}
