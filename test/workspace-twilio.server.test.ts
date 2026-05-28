import { describe, expect, test } from "vitest";

import {
  detectTwilioTrafficClass,
  getEffectiveWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioPortalConfigFromTwilioData,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
  normalizeWorkspaceTwilioOpsConfig,
  normalizeWorkspaceTwilioSyncSnapshot,
} from "../app/lib/database/workspace-twilio.server";

describe("workspace-twilio.server", () => {
  test("normalizeWorkspaceTwilioOpsConfig returns defaults for invalid input", () => {
    expect(normalizeWorkspaceTwilioOpsConfig(null)).toMatchObject({
      trafficClass: "unknown",
      sendMode: "from_number",
    });
  });

  test("normalizeWorkspaceTwilioOpsConfig parses valid config", () => {
    expect(
      normalizeWorkspaceTwilioOpsConfig({
        trafficClass: "a2p10dlc",
        throughputProduct: "market_throughput",
        multiTenancyMode: "weighted",
        trafficShapingEnabled: true,
        defaultMessageIntent: "marketing",
        sendMode: "messaging_service",
        messagingServiceSid: "MG123",
        onboardingStatus: "enabled",
        supportNotes: "note",
      }),
    ).toMatchObject({
      trafficClass: "a2p10dlc",
      throughputProduct: "market_throughput",
      multiTenancyMode: "weighted",
      trafficShapingEnabled: true,
      defaultMessageIntent: "marketing",
      sendMode: "messaging_service",
      messagingServiceSid: "MG123",
      onboardingStatus: "enabled",
      supportNotes: "note",
    });
  });

  test("normalizeWorkspaceTwilioSyncSnapshot returns defaults for invalid input", () => {
    expect(normalizeWorkspaceTwilioSyncSnapshot(undefined)).toMatchObject({
      lastSyncStatus: "never_synced",
      phoneNumberCount: 0,
    });
  });

  test("normalizeWorkspaceTwilioSyncSnapshot parses snapshot fields", () => {
    expect(
      normalizeWorkspaceTwilioSyncSnapshot({
        accountStatus: "active",
        phoneNumberCount: 3,
        numberTypes: ["local", 1],
        recentUsageCount: 10,
        usageTotalPrice: 1.25,
        lastSyncStatus: "healthy",
      }),
    ).toMatchObject({
      accountStatus: "active",
      phoneNumberCount: 3,
      numberTypes: ["local"],
      recentUsageCount: 10,
      usageTotalPrice: 1.25,
      lastSyncStatus: "healthy",
    });
  });

  test("detectTwilioTrafficClass maps sender types", () => {
    expect(detectTwilioTrafficClass(["short_code"])).toBe("short_code");
    expect(detectTwilioTrafficClass(["toll_free"])).toBe("toll_free");
    expect(detectTwilioTrafficClass(["local"])).toBe("international_long_code");
    expect(detectTwilioTrafficClass(["other"])).toBe("unknown");
  });

  test("saved portal config does not merge onboarding overrides", () => {
    const twilioData = {
      portalConfig: {
        sendMode: "from_number",
        messagingServiceSid: null,
        onboardingStatus: "not_started",
        trafficClass: "unknown",
      },
      onboarding: {
        status: "approved",
        selectedChannels: ["a2p10dlc"],
        messagingService: {
          desiredSendMode: "messaging_service",
          serviceSid: "MG999",
        },
      },
    };

    expect(getWorkspaceTwilioPortalConfigFromTwilioData(twilioData)).toMatchObject({
      sendMode: "from_number",
      messagingServiceSid: null,
    });
    expect(getEffectiveWorkspaceTwilioPortalConfig(twilioData)).toMatchObject({
      sendMode: "messaging_service",
      messagingServiceSid: "MG999",
      trafficClass: "a2p10dlc",
    });
  });

  test("getWorkspaceTwilioPortalConfigFromTwilioData handles empty twilio data", () => {
    expect(getWorkspaceTwilioPortalConfigFromTwilioData(null)).toMatchObject({
      trafficClass: "unknown",
    });
  });

  test("getWorkspaceTwilioSyncSnapshotFromTwilioData handles empty twilio data", () => {
    expect(getWorkspaceTwilioSyncSnapshotFromTwilioData(null)).toMatchObject({
      lastSyncStatus: "never_synced",
    });
  });

  test.each([
    { smsSenderClass: "verified_toll_free", expectedMps: 3 },
    { smsSenderClass: "ca_short_code", expectedMps: 100 },
    { smsSenderClass: "unknown", expectedMps: 1 },
  ])(
    "normalizeWorkspaceTwilioOpsConfig default smsTargetMps for $smsSenderClass",
    ({ smsSenderClass, expectedMps }) => {
      expect(
        normalizeWorkspaceTwilioOpsConfig({ smsSenderClass }),
      ).toMatchObject({
        smsTargetMps: expectedMps,
      });
    },
  );

  test("parallelDispatchEnabled only true when explicitly boolean true", () => {
    expect(
      normalizeWorkspaceTwilioOpsConfig({ parallelDispatchEnabled: true }),
    ).toMatchObject({ parallelDispatchEnabled: true });
    expect(
      normalizeWorkspaceTwilioOpsConfig({ parallelDispatchEnabled: "true" }),
    ).toMatchObject({ parallelDispatchEnabled: false });
  });

  test("normalizeWorkspaceTwilioSyncSnapshot parses toll-free verification flag", () => {
    expect(
      normalizeWorkspaceTwilioSyncSnapshot({
        tollFreeVerificationBlocked: true,
        lastSyncStatus: "healthy",
      }),
    ).toMatchObject({ tollFreeVerificationBlocked: true });
  });
});
