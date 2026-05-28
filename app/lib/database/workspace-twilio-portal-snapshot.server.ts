import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  type TwilioAccountData,
  type WorkspaceTwilioPortalMetrics,
} from "../types";
import {
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingFromTwilioData,
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
} from "@/lib/messaging-onboarding.server";
import {
  detectTwilioTrafficClassFromSenderTypes,
  inferSmsSenderClassFromSenderTypes,
} from "@/lib/twilio-sender-class.server";
import {
  configuredDispatcherSmsMps,
  configuredDispatcherVoiceCps,
  LEGACY_IVR_PIPELINE_CPS,
  LEGACY_MESSAGE_PIPELINE_MPS,
  twilioAssumedSmsMps,
} from "@/lib/throughput-config.server";
import {
  getEffectiveWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioPortalConfigFromTwilioData,
  DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG,
} from "./workspace-twilio-config.server";
import {
  DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
} from "./workspace-twilio-sync.server";
import type { WorkspaceTwilioPortalSnapshot } from "../types";
import {
  buildTwilioPortalRecommendations,
  buildTwilioSupportRequestSummary,
} from "./workspace-twilio-recommendations.server";

export function buildDefaultWorkspaceTwilioPortalSnapshot(): WorkspaceTwilioPortalSnapshot {
  const onboarding = {
    ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
    steps: buildOnboardingStepsForState(DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE),
  };

  return {
    config: DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG,
    effectiveConfig: DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG,
    detectedTrafficClass: "unknown",
    metrics: {
      recentOutboundCount: 0,
      rawFromCount: 0,
      messagingServiceCount: 0,
      statusCounts: {},
      numberTypes: [],
      legacyDispatcherSmsMps: LEGACY_MESSAGE_PIPELINE_MPS,
      configuredDispatcherSmsMps: LEGACY_MESSAGE_PIPELINE_MPS,
      twilioAssumedSmsMps: 1,
      legacyDispatcherVoiceCps: LEGACY_IVR_PIPELINE_CPS,
      configuredDispatcherVoiceCps: LEGACY_IVR_PIPELINE_CPS,
      voiceConcurrentCallLimit: DEFAULT_WORKSPACE_TWILIO_OPS_CONFIG.voiceConcurrentCallLimit,
      parallelDispatchEnabled: false,
      smsSenderClass: "unknown",
    },
    recommendations: [],
    supportRequestSummary: "Unable to generate a Twilio support summary.",
    syncSnapshot: DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT,
    onboarding,
    readiness: deriveWorkspaceMessagingReadiness({
      onboarding,
      workspaceNumbers: [],
      recentOutboundCount: 0,
    }),
  };
}

export async function getWorkspaceTwilioPortalSnapshot({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}) {
  const [
    { data: workspace, error: workspaceError },
    { data: workspaceNumbers, error: numbersError },
    { data: recentMessages, error: messagesError },
  ] = await Promise.all([
    supabaseClient
      .from("workspace")
      .select("name, twilio_data")
      .eq("id", workspaceId)
      .single(),
    supabaseClient
      .from("workspace_number")
      .select("type, phone_number, capabilities")
      .eq("workspace", workspaceId),
    supabaseClient
      .from("message")
      .select("status, messaging_service_sid")
      .eq("workspace", workspaceId)
      .eq("direction", "outbound-api")
      .order("date_created", { ascending: false })
      .limit(200),
  ]);

  if (workspaceError) {
    throw workspaceError;
  }
  if (numbersError) {
    throw numbersError;
  }
  if (messagesError) {
    throw messagesError;
  }

  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const config = getWorkspaceTwilioPortalConfigFromTwilioData(twilioData);
  const effectiveConfig = getEffectiveWorkspaceTwilioPortalConfig(twilioData);
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const syncSnapshot = getWorkspaceTwilioSyncSnapshotFromTwilioData(twilioData);
  const senderTypes =
    syncSnapshot.senderTypes.length > 0
      ? syncSnapshot.senderTypes
      : (workspaceNumbers ?? [])
          .map((number) => number.type)
          .filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          );
  const detectedTrafficClass = detectTwilioTrafficClassFromSenderTypes(senderTypes);
  const statusCounts = (recentMessages ?? []).reduce<
    WorkspaceTwilioPortalMetrics["statusCounts"]
  >((acc, message) => {
    if (message.status) {
      acc[message.status] = (acc[message.status] ?? 0) + 1;
    }
    return acc;
  }, {});

  const capabilitySummary =
    syncSnapshot.numberTypes.length > 0 ? syncSnapshot.numberTypes : [];

  const metrics: WorkspaceTwilioPortalMetrics = {
    recentOutboundCount: recentMessages?.length ?? 0,
    rawFromCount: (recentMessages ?? []).filter(
      (message) => !message.messaging_service_sid,
    ).length,
    messagingServiceCount: (recentMessages ?? []).filter(
      (message) => !!message.messaging_service_sid,
    ).length,
    statusCounts,
    numberTypes: capabilitySummary,
    legacyDispatcherSmsMps: LEGACY_MESSAGE_PIPELINE_MPS,
    configuredDispatcherSmsMps: configuredDispatcherSmsMps(config),
    twilioAssumedSmsMps: twilioAssumedSmsMps({
      smsSenderClass:
        config.smsSenderClass === "unknown"
          ? inferSmsSenderClassFromSenderTypes(senderTypes)
          : config.smsSenderClass,
      trafficClass: effectiveConfig.trafficClass,
      throughputProduct: effectiveConfig.throughputProduct,
      senderPoolSize: Math.max(1, syncSnapshot.phoneNumberCount),
    }),
    legacyDispatcherVoiceCps: LEGACY_IVR_PIPELINE_CPS,
    configuredDispatcherVoiceCps: configuredDispatcherVoiceCps(config),
    voiceConcurrentCallLimit: config.voiceConcurrentCallLimit,
    parallelDispatchEnabled: config.parallelDispatchEnabled,
    smsSenderClass:
      config.smsSenderClass === "unknown"
        ? inferSmsSenderClassFromSenderTypes(senderTypes)
        : config.smsSenderClass,
  };

  const recommendations = buildTwilioPortalRecommendations({
    config: effectiveConfig,
    detectedTrafficClass,
    metrics,
    advancedOptOutEnabled: onboarding.messagingService.advancedOptOutEnabled,
    syncSnapshot,
  });
  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding,
    workspaceNumbers: (workspaceNumbers ?? []).map((number) => ({
      type: number.type,
      phone_number: number.phone_number,
      capabilities: number.capabilities,
    })),
    recentOutboundCount: metrics.recentOutboundCount,
  });

  if (readiness.shouldShowOnboardingBanner) {
    recommendations.push(
      ...readiness.warnings.map((message) => ({
        severity: "warning" as const,
        message,
      })),
    );
  }

  const supportRequestSummary = buildTwilioSupportRequestSummary({
    workspaceName: workspace?.name ?? null,
    workspaceId,
    config,
    senderTypes,
    metrics,
    readiness,
    syncSnapshot,
  });

  return {
    config,
    effectiveConfig,
    onboarding,
    readiness,
    detectedTrafficClass,
    metrics,
    recommendations,
    supportRequestSummary,
    syncSnapshot,
  };
}
