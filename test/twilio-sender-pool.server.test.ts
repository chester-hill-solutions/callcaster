import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioDataMocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));

const twilioClientMocks = vi.hoisted(() => ({
  phoneNumbers: [] as Array<{ phoneNumber: string | null }>,
  channelSenders: [] as Array<{ sid: string }>,
  createChannelSender: vi.fn(async () => ({})),
}));

vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: vi.fn(async () => twilioDataMocks.data),
}));

vi.mock("@/lib/twilio-client.server", () => ({
  createWorkspaceTwilioClient: vi.fn(async () => ({})),
  listMessagingServicePhoneNumbers: vi.fn(async () => twilioClientMocks.phoneNumbers),
  listMessagingServiceChannelSenders: vi.fn(async () => twilioClientMocks.channelSenders),
  attachChannelSenderToMessagingService: (...args: unknown[]) =>
    twilioClientMocks.createChannelSender(...args),
}));

import {
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  mergeWorkspaceMessagingOnboardingState,
} from "../app/lib/messaging-onboarding.server";
import {
  attachWorkspaceRcsSenderToPool,
  verifyWorkspaceMessagingSenderPool,
} from "../app/lib/twilio-sender-pool.server";

function configureOnboarding(overrides: Parameters<typeof mergeWorkspaceMessagingOnboardingState>[1]) {
  const onboarding = mergeWorkspaceMessagingOnboardingState(
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
    overrides,
  );
  twilioDataMocks.data = { onboarding };
  return onboarding;
}

describe("twilio sender pool", () => {
  beforeEach(() => {
    twilioDataMocks.data = {};
    twilioClientMocks.phoneNumbers = [];
    twilioClientMocks.channelSenders = [];
    twilioClientMocks.createChannelSender.mockClear();
  });

  describe("verifyWorkspaceMessagingSenderPool", () => {
    test("reports no service provisioned and no RCS sender in pool when unset", async () => {
      configureOnboarding({});

      const result = await verifyWorkspaceMessagingSenderPool({ workspaceId: "w1" });

      expect(result.serviceSid).toBeNull();
      expect(result.rcsSenderId).toBeNull();
      expect(result.rcsSenderInPool).toBe(false);
    });

    test("reports rcsSenderInPool false when sender SID is recorded but missing from the live pool", async () => {
      configureOnboarding({
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
        rcs: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
          senderId: "XEabc",
        },
      });
      twilioClientMocks.channelSenders = [{ sid: "XEother" }];

      const result = await verifyWorkspaceMessagingSenderPool({ workspaceId: "w1" });

      expect(result.rcsSenderId).toBe("XEabc");
      expect(result.rcsSenderInPool).toBe(false);
    });

    test("reports rcsSenderInPool true when sender SID is present in the live pool", async () => {
      configureOnboarding({
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
        rcs: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
          senderId: "XEabc",
        },
      });
      twilioClientMocks.channelSenders = [{ sid: "XEabc" }];

      const result = await verifyWorkspaceMessagingSenderPool({ workspaceId: "w1" });

      expect(result.rcsSenderInPool).toBe(true);
    });
  });

  describe("attachWorkspaceRcsSenderToPool", () => {
    test("no-ops when there is no Messaging Service SID", async () => {
      configureOnboarding({
        rcs: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
          senderId: "XEabc",
        },
      });

      const result = await attachWorkspaceRcsSenderToPool({ workspaceId: "w1" });

      expect(result).toEqual({
        serviceSid: null,
        rcsSenderId: "XEabc",
        attached: false,
        alreadyInPool: false,
      });
      expect(twilioClientMocks.createChannelSender).not.toHaveBeenCalled();
    });

    test("no-ops when there is no recorded RCS sender SID", async () => {
      configureOnboarding({
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
      });

      const result = await attachWorkspaceRcsSenderToPool({ workspaceId: "w1" });

      expect(result).toEqual({
        serviceSid: "MG123",
        rcsSenderId: null,
        attached: false,
        alreadyInPool: false,
      });
      expect(twilioClientMocks.createChannelSender).not.toHaveBeenCalled();
    });

    test("attaches the sender when it is not yet in the pool", async () => {
      configureOnboarding({
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
        rcs: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
          senderId: "XEabc",
        },
      });
      twilioClientMocks.channelSenders = [];

      const result = await attachWorkspaceRcsSenderToPool({ workspaceId: "w1" });

      expect(result).toEqual({
        serviceSid: "MG123",
        rcsSenderId: "XEabc",
        attached: true,
        alreadyInPool: false,
      });
      expect(twilioClientMocks.createChannelSender).toHaveBeenCalledTimes(1);
      expect(twilioClientMocks.createChannelSender).toHaveBeenCalledWith(
        {},
        "MG123",
        "XEabc",
        expect.objectContaining({ workspaceId: "w1", operation: "messagingService.channelSenders.create" }),
      );
    });

    test("is idempotent when the sender is already attached", async () => {
      configureOnboarding({
        messagingService: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.messagingService,
          serviceSid: "MG123",
        },
        rcs: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.rcs,
          senderId: "XEabc",
        },
      });
      twilioClientMocks.channelSenders = [{ sid: "XEabc" }];

      const result = await attachWorkspaceRcsSenderToPool({ workspaceId: "w1" });

      expect(result).toEqual({
        serviceSid: "MG123",
        rcsSenderId: "XEabc",
        attached: false,
        alreadyInPool: true,
      });
      expect(twilioClientMocks.createChannelSender).not.toHaveBeenCalled();
    });
  });
});
