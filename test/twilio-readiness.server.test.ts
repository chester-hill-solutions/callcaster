import { describe, expect, test, vi } from "vitest";

import { WorkspaceSmsNotReadyError, assertWorkspaceCanSendSms } from "../app/lib/twilio-readiness.server";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

vi.mock("@/lib/messaging-onboarding.server", async () => {
  const actual = await vi.importActual("@/lib/messaging-onboarding.server");
  return {
    ...actual,
    getWorkspaceMessagingOnboardingState: vi.fn(),
  };
});

vi.mock("@/lib/twilio-sender-pool.server", () => ({
  verifyWorkspaceMessagingSenderPool: vi.fn(),
}));

vi.mock("@/lib/database.server", () => ({
  getWorkspaceTwilioPortalConfig: vi.fn(),
  getWorkspaceTwilioSyncSnapshotFromTwilioData: vi.fn(),
}));

import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { verifyWorkspaceMessagingSenderPool } from "@/lib/twilio-sender-pool.server";
import {
  getWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
} from "@/lib/database.server";

describe("twilio-readiness.server", () => {
  test("blocks bulk SMS when toll-free verification is blocked", async () => {
    vi.mocked(getWorkspaceMessagingOnboardingState).mockResolvedValue({
      status: "live",
      selectedChannels: [],
      messagingService: {
        serviceSid: "MG123",
        desiredSendMode: "messaging_service",
        advancedOptOutEnabled: false,
      },
      a2p10dlc: { status: "live" },
    } as never);
    vi.mocked(getWorkspaceTwilioPortalConfig).mockResolvedValue(
      makePortalConfig({ sendMode: "messaging_service" }),
    );
    vi.mocked(verifyWorkspaceMessagingSenderPool).mockResolvedValue({
      inSync: true,
      missingFromPool: [],
      livePhoneNumbers: ["+18885551212"],
    } as never);

    const null = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                twilio_data: {
                  portalSync: { tollFreeVerificationBlocked: true },
                },
              },
            }),
          }),
        }),
      }),
    };

    vi.mocked(getWorkspaceTwilioSyncSnapshotFromTwilioData).mockReturnValue({
      accountStatus: null,
      accountFriendlyName: null,
      phoneNumberCount: 1,
      numberTypes: [],
      senderTypes: ["toll_free"],
      recentUsageCount: 0,
      usageTotalPrice: null,
      lastSyncedAt: null,
      lastSyncStatus: "healthy",
      lastSyncError: null,
      tollFreeVerificationBlocked: true,
    });

    await expect(
      assertWorkspaceCanSendSms({
        null: null as never,
        workspaceId: "w1",
      }),
    ).rejects.toBeInstanceOf(WorkspaceSmsNotReadyError);
  });
});
