import { describe, expect, test } from "vitest";

import {
  detectTwilioTrafficClass,
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

  test("detectTwilioTrafficClass maps number types", () => {
    expect(detectTwilioTrafficClass(["ShortCode"])).toBe("short_code");
    expect(detectTwilioTrafficClass(["TollFree"])).toBe("toll_free");
    expect(detectTwilioTrafficClass(["Alphanumeric"])).toBe("alphanumeric");
    expect(detectTwilioTrafficClass(["InternationalLongCode"])).toBe(
      "international_long_code",
    );
    expect(detectTwilioTrafficClass(["local"])).toBe("a2p10dlc");
    expect(detectTwilioTrafficClass(["other"])).toBe("unknown");
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
});
