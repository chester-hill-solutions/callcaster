import { describe, expect, test } from "vitest";

import {
  estimateIvrCampaignOutbound,
  estimateMessageCampaignOutbound,
  IVR_PIPELINE_DIAL_ATTEMPTS_PER_SECOND,
  MESSAGE_PIPELINE_MESSAGES_PER_SECOND,
} from "../app/lib/campaign-outbound-estimate";
import type {
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
} from "../app/lib/types";

const basePortalConfig: WorkspaceTwilioOpsConfig = {
  trafficClass: "short_code",
  throughputProduct: "account_based_throughput",
  multiTenancyMode: "none",
  trafficShapingEnabled: false,
  defaultMessageIntent: null,
  sendMode: "messaging_service",
  messagingServiceSid: "MG123",
  onboardingStatus: "enabled",
  supportNotes: "",
  updatedAt: null,
  updatedBy: null,
  auditTrail: [],
};

const baseSyncSnapshot: WorkspaceTwilioSyncSnapshot = {
  accountStatus: null,
  accountFriendlyName: null,
  phoneNumberCount: 10,
  numberTypes: [],
  recentUsageCount: 0,
  usageTotalPrice: null,
  lastSyncedAt: null,
  lastSyncStatus: "never_synced",
  lastSyncError: null,
};

describe("campaign-outbound-estimate", () => {
  test("SMS estimate is pipeline-capped when Twilio heuristic is high", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: basePortalConfig,
      syncSnapshot: baseSyncSnapshot,
      smsCapableLocalNumbers: 6,
    });

    expect(estimate.pipelineMessagesPerSecond).toBeCloseTo(
      MESSAGE_PIPELINE_MESSAGES_PER_SECOND,
    );
    expect(estimate.twilioAssumedMessagesPerSecond).toBeGreaterThan(
      estimate.pipelineMessagesPerSecond,
    );
    expect(estimate.effectiveMessagesPerSecond).toBeCloseTo(
      estimate.pipelineMessagesPerSecond,
    );
  });

  test("SMS estimate is Twilio-capped when throughput assumptions are low", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: {
        ...basePortalConfig,
        trafficClass: "unknown",
        throughputProduct: "none",
        sendMode: "from_number",
      },
      syncSnapshot: {
        ...baseSyncSnapshot,
        phoneNumberCount: 1,
      },
      smsCapableLocalNumbers: 1,
    });

    expect(estimate.twilioAssumedMessagesPerSecond).toBe(1);
    expect(estimate.effectiveMessagesPerSecond).toBe(1);
    expect(estimate.effectiveMessagesPerSecond).toBeLessThan(
      estimate.pipelineMessagesPerSecond,
    );
  });

  test("IVR estimate uses queue-next + ivr-handler pacing math", () => {
    const estimate = estimateIvrCampaignOutbound({
      voiceCapableLocalNumbers: 20,
    });

    expect(estimate.pipelineDialAttemptsPerSecond).toBeCloseTo(
      IVR_PIPELINE_DIAL_ATTEMPTS_PER_SECOND,
    );
  });

  test("messaging_service uses sync pool while from_number uses local SMS count", () => {
    const messagingServiceEstimate = estimateMessageCampaignOutbound({
      portalConfig: basePortalConfig,
      syncSnapshot: {
        ...baseSyncSnapshot,
        phoneNumberCount: 8,
      },
      smsCapableLocalNumbers: 2,
    });
    const fromNumberEstimate = estimateMessageCampaignOutbound({
      portalConfig: {
        ...basePortalConfig,
        sendMode: "from_number",
      },
      syncSnapshot: {
        ...baseSyncSnapshot,
        phoneNumberCount: 8,
      },
      smsCapableLocalNumbers: 2,
    });

    expect(messagingServiceEstimate.senderPoolSize).toBe(8);
    expect(fromNumberEstimate.senderPoolSize).toBe(2);
  });

  test("from_number mode honors selected caller number context", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: {
        ...basePortalConfig,
        sendMode: "from_number",
      },
      syncSnapshot: baseSyncSnapshot,
      smsCapableLocalNumbers: 6,
      selectedCallerId: "+15551112222",
      selectedCallerIdSmsCapable: true,
    });

    expect(estimate.senderPoolSize).toBe(1);
    expect(estimate.senderContextLabel).toContain("+15551112222");
  });

  test("messaging_service mode prefers selected service SID in context label", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: basePortalConfig,
      syncSnapshot: baseSyncSnapshot,
      smsCapableLocalNumbers: 2,
      selectedMessagingServiceSid: "MG_SELECTED",
    });

    expect(estimate.senderContextLabel).toContain("MG_SELECTED");
  });
});
