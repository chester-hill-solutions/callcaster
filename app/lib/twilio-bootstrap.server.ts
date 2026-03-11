import Twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { hydrateWorkspaceRcsOnboardingState } from "@/lib/rcs-onboarding.server";
import type { TwilioAccountData } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function persistWorkspaceTwilioData({
  supabaseClient,
  workspaceId,
  twilioData,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  twilioData: Record<string, unknown>;
}) {
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

export async function ensureWorkspaceTwilioBootstrap({
  supabaseClient,
  workspaceId,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
}) {
  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("id, name, twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const currentTwilioData = isRecord(workspace?.twilio_data) ? workspace.twilio_data : {};
  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const accountSid = parseOptionalString(currentTwilioData.sid);
  const authToken = parseOptionalString(currentTwilioData.authToken);

  if (!accountSid || !authToken) {
    throw new Error("Workspace is missing Twilio account credentials");
  }

  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const callbackBaseUrl = env.BASE_URL();
  const nextOnboardingBase = mergeWorkspaceMessagingOnboardingState(onboarding, {
    currentStep: onboarding.messagingService.serviceSid
      ? onboarding.currentStep
      : "messaging_service",
    status:
      onboarding.status === "not_started" ? "provisioning" : onboarding.status,
    subaccountBootstrap: {
      ...onboarding.subaccountBootstrap,
      status: "provisioning",
      callbackBaseUrl,
      inboundVoiceUrl: `${callbackBaseUrl}/api/inbound`,
      inboundSmsUrl: `${callbackBaseUrl}/api/inbound-sms`,
      statusCallbackUrl: `${callbackBaseUrl}/api/caller-id/status`,
      lastError: null,
    },
  });

  const twilio = new Twilio.Twilio(accountSid, authToken);
  let nextOnboarding = nextOnboardingBase;

  try {
    if (!nextOnboarding.messagingService.serviceSid) {
      const createdService = await (twilio as any).messaging?.v1?.services?.create?.({
        friendlyName: `${workspace?.name ?? workspaceId} Messaging`,
      });

      nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
        messagingService: {
          ...nextOnboarding.messagingService,
          serviceSid: parseOptionalString(createdService?.sid),
          friendlyName:
            parseOptionalString(createdService?.friendlyName) ??
            `${workspace?.name ?? workspaceId} Messaging`,
          provisioningStatus: createdService?.sid ? "live" : "provisioning",
          lastProvisionedAt: new Date().toISOString(),
          supportedChannels: ["a2p10dlc"],
          lastError: createdService?.sid
            ? null
            : "Messaging Service could not be created automatically.",
        },
        subaccountBootstrap: {
          ...nextOnboarding.subaccountBootstrap,
          createdResources: [
            ...nextOnboarding.subaccountBootstrap.createdResources,
            ...(createdService?.sid
              ? [`messaging_service:${String(createdService.sid)}`]
              : []),
          ],
        },
      });
    }

    nextOnboarding = hydrateWorkspaceRcsOnboardingState(nextOnboarding);
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: nextOnboarding.messagingService.serviceSid ? "collecting_business" : "provisioning",
      currentStep: nextOnboarding.messagingService.serviceSid
        ? "business_profile"
        : "messaging_service",
      steps: buildOnboardingStepsForState(nextOnboarding),
      subaccountBootstrap: {
        ...nextOnboarding.subaccountBootstrap,
        status: nextOnboarding.messagingService.serviceSid ? "live" : "provisioning",
        lastSyncedAt: new Date().toISOString(),
        lastError: nextOnboarding.messagingService.lastError,
      },
      reviewState: {
        ...nextOnboarding.reviewState,
        lastUpdatedAt: new Date().toISOString(),
      },
      lastUpdatedBy: actorUserId,
    });
  } catch (bootstrapError) {
    logger.error("Error bootstrapping workspace Twilio resources:", bootstrapError);
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: "provisioning",
      steps: buildOnboardingStepsForState(nextOnboarding),
      subaccountBootstrap: {
        ...nextOnboarding.subaccountBootstrap,
        status: "rejected",
        lastSyncedAt: new Date().toISOString(),
        lastError:
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Unknown bootstrap failure",
      },
      reviewState: {
        ...nextOnboarding.reviewState,
        lastError:
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Unknown bootstrap failure",
        lastUpdatedAt: new Date().toISOString(),
      },
      lastUpdatedBy: actorUserId,
    });
  }

  await persistWorkspaceTwilioData({
    supabaseClient,
    workspaceId,
    twilioData: {
      ...currentTwilioData,
      onboarding: nextOnboarding,
    },
  });

  return nextOnboarding;
}

export async function syncWorkspaceTwilioBootstrapState({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    subaccountBootstrap: {
      ...onboarding.subaccountBootstrap,
      lastSyncedAt: new Date().toISOString(),
      status: onboarding.messagingService.serviceSid ? "live" : onboarding.subaccountBootstrap.status,
      driftMessages: onboarding.messagingService.serviceSid
        ? []
        : ["Messaging Service is missing from the expected bootstrap resources."],
    },
  });
  nextOnboarding.steps = buildOnboardingStepsForState(nextOnboarding);

  await persistWorkspaceTwilioData({
    supabaseClient,
    workspaceId,
    twilioData: {
      ...(isRecord(workspace?.twilio_data) ? workspace.twilio_data : {}),
      onboarding: nextOnboarding,
    },
  });

  return nextOnboarding;
}
