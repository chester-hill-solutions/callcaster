import { describe, expect, test } from "vitest";

import {
  estimateIvrCampaignOutbound,
  estimateMessageCampaignOutbound,
  estimateOutboundCompletion,
} from "../app/lib/campaign-outbound-estimate";
import {
  LEGACY_MESSAGE_PIPELINE_MPS,
} from "../app/lib/throughput-config";
import type { WorkspaceTwilioSyncSnapshot } from "../app/lib/types";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

const basePortalConfig = makePortalConfig({
  trafficClass: "short_code",
  throughputProduct: "account_based_throughput",
  sendMode: "messaging_service",
  messagingServiceSid: "MG123",
  onboardingStatus: "enabled",
  smsSenderClass: "ca_short_code",
  smsTargetMps: 100,
});

const baseSyncSnapshot: WorkspaceTwilioSyncSnapshot = {
  accountStatus: null,
  accountFriendlyName: null,
  phoneNumberCount: 10,
  numberTypes: [],
  senderTypes: [],
  recentUsageCount: 0,
  usageTotalPrice: null,
  lastSyncedAt: null,
  lastSyncStatus: "never_synced",
  lastSyncError: null,
};

describe("campaign-outbound-estimate", () => {
  test("IVR planning matches the due-aware one-CPS dispatch cadence (#3007)", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: basePortalConfig,
      voiceCapableLocalNumbers: 1,
    });
    // The due-aware worker and provider-start pacer target one call per second.
    // The previous five-second idle wait limited legacy batches to 24/minute.
    expect(estimate.effectiveDialAttemptsPerSecond * 60).toBe(60);
    expect(estimate.effectiveCompletionPerSecond * 60).toBe(60);
  });

  test("six minutes of one-CPS progress keeps the projected finish stable (#3007)", () => {
    const { effectiveCompletionPerSecond: ratePerSecond } = estimateIvrCampaignOutbound({
      portalConfig: basePortalConfig, voiceCapableLocalNumbers: 1,
    });
    const before = estimateOutboundCompletion({
      queueCount: 2600, ratePerSecond, now: new Date("2026-10-21T12:28:00Z"),
    });
    const after = estimateOutboundCompletion({
      queueCount: 2240, ratePerSecond, now: new Date("2026-10-21T12:34:00Z"),
    });
    expect(before?.averageFinish.toISOString()).toBe("2026-10-21T13:11:20.000Z");
    expect(after?.averageFinish).toEqual(before?.averageFinish);
  });
  test("SMS estimate is pipeline-capped when Twilio heuristic is high", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: basePortalConfig,
      syncSnapshot: baseSyncSnapshot,
      smsCapableLocalNumbers: 6,
    });

    expect(estimate.pipelineMessagesPerSecond).toBeCloseTo(
      LEGACY_MESSAGE_PIPELINE_MPS,
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
        smsSenderClass: "unknown",
        smsTargetMps: 1,
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

  test("IVR estimate uses durable batch pacing instead of legacy webhook delays", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: basePortalConfig,
      voiceCapableLocalNumbers: 20,
    });

    expect(estimate.pipelineDialAttemptsPerSecond).toBeCloseTo(
      1,
    );
  });

  test("IVR completion rate is bounded by the concurrent call limit over avg call time (#1874)", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: makePortalConfig({ parallelDispatchEnabled: true, voiceTargetCps: 20 }),
      voiceCapableLocalNumbers: 20,
    });

    expect(estimate.effectiveDialAttemptsPerSecond).toBeCloseTo(
      20,
      3,
    );
    expect(estimate.effectiveCompletionPerSecond).toBeCloseTo(100 / 75, 3);
    expect(estimate.effectiveCompletionPerSecond).toBeLessThan(
      estimate.effectiveDialAttemptsPerSecond,
    );
    expect(estimate.avgCallDurationSeconds).toBe(75);
    expect(estimate.warnings.join(" ")).toContain(
      "bound by the concurrent call limit",
    );
  });

  test("IVR completion rate equals the dial-start rate when concurrency is not the bound", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: makePortalConfig({ voiceConcurrentCallLimit: 10_000 }),
      voiceCapableLocalNumbers: 20,
    });

    expect(estimate.effectiveCompletionPerSecond).toBeCloseTo(
      estimate.effectiveDialAttemptsPerSecond,
      3,
    );
  });

  test("a low concurrent call limit caps completion well below the dial-start rate", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: makePortalConfig({ voiceConcurrentCallLimit: 10 }),
      voiceCapableLocalNumbers: 20,
    });

    expect(estimate.effectiveCompletionPerSecond).toBeCloseTo(10 / 75, 3);
  });

  test("worker batch rounding never makes the projection exceed the configured rate", () => {
    const estimate = estimateIvrCampaignOutbound({
      portalConfig: makePortalConfig({ parallelDispatchEnabled: true, voiceTargetCps: 0.1 }),
      voiceCapableLocalNumbers: 1,
    });
    expect(estimate.effectiveDialAttemptsPerSecond).toBe(0.1);
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

  test("parallel dispatch estimate uses configured dispatcher rates", () => {
    const estimate = estimateMessageCampaignOutbound({
      portalConfig: {
        ...basePortalConfig,
        parallelDispatchEnabled: true,
        smsTargetMps: 3,
      },
      syncSnapshot: baseSyncSnapshot,
      smsCapableLocalNumbers: 2,
    });

    expect(estimate.configuredDispatcherMessagesPerSecond).toBe(3);
  });
});
