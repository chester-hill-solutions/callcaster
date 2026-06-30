import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { logger } from "@/lib/logger.server";
import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { hydrateWorkspaceRcsOnboardingState } from "@/lib/rcs-onboarding.server";
import type { TwilioAccountData, WorkspaceMessagingOnboardingState } from "@/lib/types";
import { env } from "@/lib/env.server";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { isObject } from "@/lib/type-safety-utils";
import { presentTwilioError, twilioErrorUserMessage } from "@/lib/twilio-errors";
import {
  attachPhoneNumberToMessagingService,
  createMessagingService,
  createWorkspaceTwilioClient,
  listMessagingServicePhoneNumbers,
  updateMessagingService,
} from "@/lib/twilio-client.server";
import { auditWorkspaceTwilioWebhooks } from "@/lib/twilio-webhook-audit.server";

export type TwilioBootstrapOutcome = "success" | "partial" | "failed";

export type WorkspaceTwilioBootstrapResult = {
  outcome: TwilioBootstrapOutcome;
  onboarding: WorkspaceMessagingOnboardingState;
  serviceSid: string | null;
  lastError: string | null;
  createdResources: string[];
  driftMessages: string[];
};

import { persistWorkspaceTwilioData as saveWorkspaceTwilioData, loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
function buildBootstrapUrls(callbackBaseUrl: string) {
  return {
    callbackBaseUrl,
    inboundVoiceUrl: `${callbackBaseUrl}/api/inbound`,
    inboundSmsUrl: `${callbackBaseUrl}/api/inbound-sms`,
    statusCallbackUrl: `${callbackBaseUrl}/api/caller-id/status`,
  };
}

async function configureMessagingServiceInTwilio({
  twilio,
  serviceSid,
  onboarding,
  workspaceId,
}: {
  twilio: Awaited<ReturnType<typeof createWorkspaceTwilioClient>>;
  serviceSid: string;
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceId: string;
}) {
  const urls = buildBootstrapUrls(
    onboarding.subaccountBootstrap.callbackBaseUrl ?? env.BASE_URL(),
  );

  await updateMessagingService(
    twilio,
    serviceSid,
    {
      friendlyName:
        onboarding.messagingService.friendlyName ??
        undefined,
      statusCallback: urls.statusCallbackUrl,
      stickySender: onboarding.messagingService.stickySenderEnabled,
      areaCodeGeomatch: true,
      useInboundWebhookOnNumber: true,
      smartEncoding: true,
    },
    { workspaceId, operation: "messagingService.update" },
  );
}

function resolveBootstrapOutcome(
  onboarding: WorkspaceMessagingOnboardingState,
  bootstrapThrew: boolean,
): TwilioBootstrapOutcome {
  const sid = onboarding.messagingService.serviceSid;
  if (bootstrapThrew || onboarding.subaccountBootstrap.status === "rejected") {
    return "failed";
  }
  if (!sid) {
    return onboarding.messagingService.lastError ? "failed" : "partial";
  }
  if (
    onboarding.messagingService.lastError ||
    onboarding.subaccountBootstrap.driftMessages.length > 0
  ) {
    return "partial";
  }
  return "success";
}

export async function ensureWorkspaceTwilioBootstrap({
  supabaseClient,
  workspaceId,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
}): Promise<WorkspaceTwilioBootstrapResult> {
  const [workspace] = await adminDb
    .select({
      id: workspaceTable.id,
      name: workspaceTable.name,
      twilio_data: workspaceTable.twilio_data,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const currentTwilioData = isObject(workspace.twilio_data)
    ? workspace.twilio_data
    : await loadWorkspaceTwilioData(supabaseClient, workspaceId);
  const twilioData = (workspace.twilio_data ?? null) as TwilioAccountData;
  const accountSid = parseOptionalString(currentTwilioData.sid);
  const authToken = parseOptionalString(currentTwilioData.authToken);

  if (!accountSid || !authToken) {
    throw new Error("Workspace is missing Twilio account credentials");
  }

  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const callbackBaseUrl = env.BASE_URL();
  const urls = buildBootstrapUrls(callbackBaseUrl);
  const createdResources: string[] = [...onboarding.subaccountBootstrap.createdResources];
  const driftMessages: string[] = [];

  let nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    currentStep: onboarding.messagingService.serviceSid
      ? onboarding.currentStep
      : "messaging_service",
    status:
      onboarding.status === "not_started" ? "provisioning" : onboarding.status,
    subaccountBootstrap: {
      ...onboarding.subaccountBootstrap,
      status: "provisioning",
      ...urls,
      lastError: null,
    },
  });

  const twilio = await createWorkspaceTwilioClient({
    supabase: supabaseClient,
    workspaceId,
  });

  let bootstrapThrew = false;

  try {
    if (!nextOnboarding.messagingService.serviceSid) {
      const createdService = await createMessagingService(
        twilio,
        {
          friendlyName: `${workspace?.name ?? workspaceId} Messaging`,
        },
        { workspaceId, operation: "messagingService.create" },
      );

      const serviceSid = parseOptionalString(createdService?.sid);
      if (serviceSid) {
        createdResources.push(`messaging_service:${serviceSid}`);
      }

      nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
        messagingService: {
          ...nextOnboarding.messagingService,
          serviceSid,
          friendlyName:
            parseOptionalString(createdService?.friendlyName) ??
            `${workspace?.name ?? workspaceId} Messaging`,
          provisioningStatus: serviceSid ? "live" : "provisioning",
          lastProvisionedAt: new Date().toISOString(),
          supportedChannels: ["a2p10dlc"],
          lastError: serviceSid
            ? null
            : "Messaging Service could not be created automatically.",
        },
        subaccountBootstrap: {
          ...nextOnboarding.subaccountBootstrap,
          createdResources: [...new Set(createdResources)],
        },
      });
    }

    const serviceSid = nextOnboarding.messagingService.serviceSid;
    if (serviceSid) {
      try {
        await configureMessagingServiceInTwilio({
          twilio,
          serviceSid,
          onboarding: nextOnboarding,
          workspaceId,
        });
      } catch (configError) {
        const userMsg = twilioErrorUserMessage(configError);
        driftMessages.push(
          `Messaging Service ${serviceSid} was created but live configuration failed: ${userMsg}`,
        );
        logger.error("Messaging Service post-create configuration failed:", configError);
        nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
          messagingService: {
            ...nextOnboarding.messagingService,
            lastError: userMsg,
          },
        });
      }
    }

    nextOnboarding = hydrateWorkspaceRcsOnboardingState(nextOnboarding);
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: nextOnboarding.messagingService.serviceSid
        ? "collecting_business"
        : "provisioning",
      currentStep: nextOnboarding.messagingService.serviceSid
        ? "first_number"
        : "messaging_service",
      steps: buildOnboardingStepsForState(nextOnboarding),
      subaccountBootstrap: {
        ...nextOnboarding.subaccountBootstrap,
        status: nextOnboarding.messagingService.serviceSid ? "live" : "provisioning",
        lastSyncedAt: new Date().toISOString(),
        lastError:
          nextOnboarding.messagingService.lastError ??
          nextOnboarding.subaccountBootstrap.lastError,
        driftMessages: [...new Set([...nextOnboarding.subaccountBootstrap.driftMessages, ...driftMessages])],
        createdResources: [...new Set(createdResources)],
      },
      reviewState: {
        ...nextOnboarding.reviewState,
        lastUpdatedAt: new Date().toISOString(),
      },
      lastUpdatedBy: actorUserId,
    });
  } catch (bootstrapError) {
    bootstrapThrew = true;
    const userMsg = twilioErrorUserMessage(bootstrapError);
    const adminDetail = presentTwilioError(bootstrapError).adminDetail;
    logger.error("Error bootstrapping workspace Twilio resources:", bootstrapError);
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(nextOnboarding, {
      status: "provisioning",
      steps: buildOnboardingStepsForState(nextOnboarding),
      subaccountBootstrap: {
        ...nextOnboarding.subaccountBootstrap,
        status: "rejected",
        lastSyncedAt: new Date().toISOString(),
        lastError: userMsg,
        driftMessages: [...new Set([...nextOnboarding.subaccountBootstrap.driftMessages, ...driftMessages])],
        createdResources: [...new Set(createdResources)],
      },
      reviewState: {
        ...nextOnboarding.reviewState,
        lastError: adminDetail,
        lastUpdatedAt: new Date().toISOString(),
      },
      lastUpdatedBy: actorUserId,
    });
  }

  const outcome = resolveBootstrapOutcome(nextOnboarding, bootstrapThrew);

  await saveWorkspaceTwilioData(supabaseClient, workspaceId, {
    ...currentTwilioData,
    onboarding: nextOnboarding,
  });

  return {
    outcome,
    onboarding: nextOnboarding,
    serviceSid: nextOnboarding.messagingService.serviceSid,
    lastError:
      nextOnboarding.subaccountBootstrap.lastError ??
      nextOnboarding.messagingService.lastError,
    createdResources: [...new Set(createdResources)],
    driftMessages: nextOnboarding.subaccountBootstrap.driftMessages,
  };
}

export async function syncWorkspaceTwilioBootstrapState({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const currentTwilioData = await loadWorkspaceTwilioData(supabaseClient, workspaceId);
  const twilioData = currentTwilioData as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  let driftMessages = onboarding.messagingService.serviceSid
    ? []
    : ["Messaging Service is missing from the expected bootstrap resources."];

  try {
    const audit = await auditWorkspaceTwilioWebhooks({
      supabaseClient,
      workspaceId,
    });
    driftMessages = [...new Set([...driftMessages, ...audit.driftMessages])];
  } catch (auditError) {
    logger.error("Twilio webhook audit failed during sync:", auditError);
    driftMessages = [
      ...driftMessages,
      "Could not compare live Twilio webhook URLs (audit failed).",
    ];
  }

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    subaccountBootstrap: {
      ...onboarding.subaccountBootstrap,
      lastSyncedAt: new Date().toISOString(),
      status: onboarding.messagingService.serviceSid
        ? onboarding.subaccountBootstrap.status === "rejected"
          ? "rejected"
          : driftMessages.length > 0
            ? "provisioning"
            : "live"
        : onboarding.subaccountBootstrap.status,
      driftMessages,
    },
  });
  nextOnboarding.steps = buildOnboardingStepsForState(nextOnboarding);

  await saveWorkspaceTwilioData(supabaseClient, workspaceId, {
    ...currentTwilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}

export async function repairWorkspaceTwilioWebhooks({
  supabaseClient,
  workspaceId,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
}) {
  const currentTwilioData = await loadWorkspaceTwilioData(supabaseClient, workspaceId);
  const twilioData = currentTwilioData as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const serviceSid = onboarding.messagingService.serviceSid;
  const baseUrl = env.BASE_URL();
  const urls = buildBootstrapUrls(baseUrl);

  const twilio = await createWorkspaceTwilioClient({
    supabase: supabaseClient,
    workspaceId,
  });

  const repaired: string[] = [];

  const numbers = await twilio.incomingPhoneNumbers.list({ limit: 200 });
  for (const number of numbers) {
    if (!number.sid) continue;
    await twilio.incomingPhoneNumbers(number.sid).update({
      voiceUrl: urls.inboundVoiceUrl,
      smsUrl: urls.inboundSmsUrl,
      statusCallback: urls.statusCallbackUrl,
      statusCallbackMethod: "POST",
    });
    repaired.push(`number:${number.phoneNumber}`);
  }

  if (serviceSid) {
    await configureMessagingServiceInTwilio({
      twilio,
      serviceSid,
      onboarding: mergeWorkspaceMessagingOnboardingState(onboarding, {
        subaccountBootstrap: { ...onboarding.subaccountBootstrap, ...urls },
      }),
      workspaceId,
    });
    repaired.push(`messaging_service:${serviceSid}`);
  }

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    subaccountBootstrap: {
      ...onboarding.subaccountBootstrap,
      ...urls,
      lastSyncedAt: new Date().toISOString(),
      driftMessages: [],
      lastError: null,
    },
    lastUpdatedBy: actorUserId,
  });
  nextOnboarding.steps = buildOnboardingStepsForState(nextOnboarding);

  await saveWorkspaceTwilioData(supabaseClient, workspaceId, {
    ...currentTwilioData,
    onboarding: nextOnboarding,
  });

  return { repaired, onboarding: nextOnboarding };
}

export {
  attachPhoneNumberToMessagingService,
  listMessagingServicePhoneNumbers,
};
