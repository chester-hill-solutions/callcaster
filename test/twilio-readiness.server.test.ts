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

// Pin the RCS flag off: this suite documents pre-RCS readiness semantics
// (flag-on paths are covered by test/rcs-onboarding.server.test.ts).
vi.mock("@/lib/rcs-onboarding-flags", () => ({
  RCS_ONBOARDING_ENABLED: false,
  isRcsOnboardingEnabled: () => false,
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getWorkspaceTwilioPortalConfig: vi.fn(),
  getWorkspaceTwilioSyncSnapshotFromTwilioData: vi.fn(),
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{
            twilio_data: {
              portalSync: { tollFreeVerificationBlocked: true },
            },
          }]),
        })),
      })),
    })),
  },
}));

import {
  getWorkspaceMessagingOnboardingState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
} from "@/lib/messaging-onboarding.server";
import { verifyWorkspaceMessagingSenderPool } from "@/lib/twilio-sender-pool.server";
import {
  getWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
} from "@/lib/database/workspace.server";

describe("twilio-readiness.server", () => {
  test("blocks bulk SMS when toll-free verification is blocked", async () => {
    vi.mocked(getWorkspaceMessagingOnboardingState).mockResolvedValue({
      ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      status: "live",
      operatingCountry: "CA",
      selectedChannels: [],
      messagingService: {
        ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
        serviceSid: "MG123",
        desiredSendMode: "messaging_service",
        advancedOptOutEnabled: false,
      },
      a2p10dlc: {
        ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.a2p10dlc,
        status: "live",
      },
    } as never);
    vi.mocked(getWorkspaceTwilioPortalConfig).mockResolvedValue(
      makePortalConfig({ sendMode: "messaging_service" }),
    );
    vi.mocked(verifyWorkspaceMessagingSenderPool).mockResolvedValue({
      inSync: true,
      missingFromPool: [],
      livePhoneNumbers: ["+18885551212"],
    } as never);

    const dbClient = {
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
        workspaceId: "w1",
      }),
    ).rejects.toBeInstanceOf(WorkspaceSmsNotReadyError);
  });
});
