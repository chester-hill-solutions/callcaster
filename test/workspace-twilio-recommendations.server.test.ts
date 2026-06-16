import { describe, expect, test } from "vitest";

import { buildTwilioPortalRecommendations } from "../app/lib/database/workspace-twilio-recommendations.server";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

describe("workspace-twilio-recommendations", () => {
  test("surfaces toll-free verification block from sync snapshot", () => {
    const recommendations = buildTwilioPortalRecommendations({
      config: makePortalConfig({ smsSenderClass: "verified_toll_free" }),
      detectedTrafficClass: "toll_free",
      metrics: {
        recentOutboundCount: 0,
        rawFromCount: 0,
        messagingServiceCount: 0,
        statusCounts: {},
        numberTypes: [],
        legacyDispatcherSmsMps: 2,
        configuredDispatcherSmsMps: 2,
        twilioAssumedSmsMps: 3,
        legacyDispatcherVoiceCps: 1000 / 700,
        configuredDispatcherVoiceCps: 1000 / 700,
        voiceConcurrentCallLimit: 100,
        parallelDispatchEnabled: false,
        smsSenderClass: "verified_toll_free",
      },
      advancedOptOutEnabled: false,
      syncSnapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 1,
        numberTypes: ["sms"],
        senderTypes: ["toll_free"],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: null,
        lastSyncStatus: "healthy",
        lastSyncError: null,
        tollFreeVerificationBlocked: true,
      },
    });

    expect(
      recommendations.some((item) =>
        item.message.includes("Toll-free verification is pending or rejected"),
      ),
    ).toBe(true);
  });
});
