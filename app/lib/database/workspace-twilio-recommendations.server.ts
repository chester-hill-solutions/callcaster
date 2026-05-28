import type {
  TwilioTrafficClass,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioPortalMetrics,
  WorkspaceTwilioPortalRecommendation,
  WorkspaceTwilioSyncSnapshot,
} from "../types";
import { defaultSmsTargetMps } from "@/lib/throughput-config.server";

export function buildTwilioPortalRecommendations({
  config,
  detectedTrafficClass,
  metrics,
  advancedOptOutEnabled,
  syncSnapshot,
}: {
  config: WorkspaceTwilioOpsConfig;
  detectedTrafficClass: TwilioTrafficClass;
  metrics: WorkspaceTwilioPortalMetrics;
  advancedOptOutEnabled: boolean;
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
}): WorkspaceTwilioPortalRecommendation[] {
  const recommendations: WorkspaceTwilioPortalRecommendation[] = [];

  if (
    config.trafficClass === "a2p10dlc" &&
    config.throughputProduct !== "none"
  ) {
    recommendations.push({
      severity: "warning",
      message:
        "US A2P 10DLC traffic is carrier-capped, so parent-account throughput products will not raise campaign MPS.",
    });
  }

  if (config.smsSenderClass === "ca_local") {
    recommendations.push({
      severity: "warning",
      message:
        "Bulk SMS on Canadian local long codes has poor deliverability at volume. Use verified toll-free or a Canadian short code for campaigns.",
    });
  }

  if (
    config.parallelDispatchEnabled &&
    config.smsTargetMps > defaultSmsTargetMps(config.smsSenderClass)
  ) {
    recommendations.push({
      severity: "warning",
      message:
        "Configured SMS target MPS exceeds the typical Twilio limit for the selected sender class. Confirm Twilio MPS before raising further.",
    });
  }

  if (config.parallelDispatchEnabled && config.voiceTargetCps > 5) {
    recommendations.push({
      severity: "info",
      message:
        "Voice target CPS above 5 usually requires an approved Business Profile and a Twilio CPS increase request.",
    });
  }

  if (!config.parallelDispatchEnabled) {
    recommendations.push({
      severity: "info",
      message:
        "Campaign dispatch is still on the legacy sequential pipeline (~2 MPS SMS / ~1.4 CPS IVR). Enable parallel dispatch after Twilio limits are confirmed.",
    });
  }

  if (config.parallelDispatchEnabled) {
    recommendations.push({
      severity: "info",
      message:
        "Parallel dispatch is enabled. Monitor duplicate sends and stuck assigned queue rows during rollout; disable parallel dispatch to roll back to legacy pacing.",
    });
  }

  if (syncSnapshot.tollFreeVerificationBlocked) {
    recommendations.push({
      severity: "warning",
      message:
        "Toll-free verification is pending or rejected for this workspace. Bulk SMS is blocked until Twilio approves toll-free verification.",
    });
  } else if (config.smsSenderClass === "verified_toll_free") {
    recommendations.push({
      severity: "info",
      message:
        "Toll-free senders require Twilio toll-free verification before bulk SMS. Confirm verification status in Twilio Console.",
    });
  }

  if (config.sendMode === "messaging_service" && !config.messagingServiceSid) {
    recommendations.push({
      severity: "warning",
      message:
        "This workspace is set to Messaging Service mode, but no Messaging Service SID is configured.",
    });
  }

  if (advancedOptOutEnabled && config.messagingServiceSid) {
    recommendations.push({
      severity: "info",
      message:
        "Advanced Opt-Out is requested for this workspace. Enable it in Twilio Console → Messaging Service → Opt-Out Management (not available via API).",
    });
  }

  if (config.trafficShapingEnabled && !config.defaultMessageIntent) {
    recommendations.push({
      severity: "warning",
      message:
        "Traffic Shaping is enabled, but no default MessageIntent is configured, so messages will not be prioritized unless callers override it.",
    });
  }

  if (config.trafficClass === "unknown" && detectedTrafficClass !== "unknown") {
    recommendations.push({
      severity: "info",
      message: `Workspace phone numbers suggest ${detectedTrafficClass} traffic. Update the saved traffic class if that matches current operations.`,
    });
  }

  if (
    detectedTrafficClass !== "a2p10dlc" &&
    detectedTrafficClass !== "unknown" &&
    config.throughputProduct === "none"
  ) {
    recommendations.push({
      severity: "info",
      message:
        "This sender mix is eligible for parent-account throughput controls. Consider Market Throughput or Account Based Throughput plus Multi-Tenancy.",
    });
  }

  if (
    metrics.recentOutboundCount > 0 &&
    metrics.rawFromCount === metrics.recentOutboundCount
  ) {
    recommendations.push({
      severity: "info",
      message:
        "Recent outbound traffic is using raw From numbers only. Messaging Services can help with sender pooling and throughput operations.",
    });
  }

  return recommendations;
}

export function buildTwilioSupportRequestSummary(args: {
  workspaceName: string | null;
  workspaceId: string;
  config: WorkspaceTwilioOpsConfig;
  senderTypes: string[];
  metrics: WorkspaceTwilioPortalMetrics;
  readiness: {
    messagingReady: boolean;
    voiceReady: boolean;
  };
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
}): string {
  const {
    workspaceName,
    workspaceId,
    config,
    senderTypes,
    metrics,
    readiness,
    syncSnapshot,
  } = args;

  return [
    `Workspace: ${workspaceName ?? workspaceId}`,
    `Traffic class: ${config.trafficClass}`,
    `Detected sender types: ${senderTypes.length ? senderTypes.join(", ") : "none detected"}`,
    `Throughput product: ${config.throughputProduct}`,
    `Multi-tenancy: ${config.multiTenancyMode}`,
    `Traffic shaping: ${config.trafficShapingEnabled ? "enabled" : "disabled"}`,
    `Default MessageIntent: ${config.defaultMessageIntent ?? "none"}`,
    `Send mode: ${config.sendMode}`,
    `Messaging Service SID: ${config.messagingServiceSid ?? "not configured"}`,
    `Recent outbound messages: ${metrics.recentOutboundCount}`,
    `Recent messaging-service sends: ${metrics.messagingServiceCount}`,
    `Recent raw-from sends: ${metrics.rawFromCount}`,
    `Messaging ready: ${readiness.messagingReady ? "yes" : "no"}`,
    `Voice ready: ${readiness.voiceReady ? "yes" : "no"}`,
    `SMS sender class: ${metrics.smsSenderClass}`,
    `Parallel dispatch: ${metrics.parallelDispatchEnabled ? "enabled" : "legacy"}`,
    `Dispatcher SMS MPS: ${metrics.configuredDispatcherSmsMps}`,
    `Twilio assumed SMS MPS: ${metrics.twilioAssumedSmsMps}`,
    `Dispatcher voice CPS: ${metrics.configuredDispatcherVoiceCps}`,
    `IVR concurrent call limit: ${metrics.voiceConcurrentCallLimit}`,
    `Toll-free verification blocked: ${syncSnapshot.tollFreeVerificationBlocked ? "yes" : "no"}`,
    `Support notes: ${config.supportNotes || "none"}`,
  ].join("\n");
}
