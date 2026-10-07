import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { onboardingFixture } from "./fixtures/onboarding";

const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("@/server/admin-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-db")>()),
  adminDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ twilio_data: fixture.data }],
        }),
      }),
    }),
  },
}));
let sdk: Twilio;
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => sdk,
}));
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import {
  attachWorkspaceRcsSenderToPool,
  verifyWorkspaceMessagingSenderPool,
} from "@/lib/twilio-sender-pool.server";

const phone = "+15555551212";
const serviceSid = `MG${"1".repeat(32)}`;
const senderSid = `XE${"2".repeat(32)}`;
let livePhones: string[];
let liveChannels: string[];
let rejected: boolean;
let beforeRead: (() => Promise<void>) | undefined;
let request: ReturnType<typeof vi.spyOn<RequestClient, "request">>;
const interactive = { workspaceId: "w1", reuseProviderSnapshot: true };
function setupData() {
  const state = onboardingFixture();
  fixture.data = {
    sid: `AC${"3".repeat(32)}`,
    authToken: "owned-test-token",
    portalSync: {
      lastSyncStatus: "healthy",
      tollFreeVerificationBlocked: false,
      tollFreeVerificationCheckedAt: "2026-10-07T09:00:00Z",
    },
    onboarding: {
      ...state,
      operatingCountry: "US",
      selectedChannels: ["a2p10dlc"],
      messagingService: {
        ...state.messagingService,
        serviceSid,
        attachedSenderPhoneNumbers: [phone],
      },
      a2p10dlc: {
        ...state.a2p10dlc,
        status: "approved",
        messagingProfileStatus: "ready",
        messagingProfileEndUserSid: "ITfixture",
        trustProductSid: "BUfixture",
        brandSid: "BNfixture",
        campaignSid: "QEfixture",
      },
    },
  };
}
function onboarding() {
  return fixture.data.onboarding as ReturnType<typeof onboardingFixture>;
}
function readCount() {
  return request.mock.calls.filter(
    ([input]) => input.method === "get" || input.method === "GET",
  ).length;
}
function installTransport() {
  const transport = new RequestClient();
  request = vi.spyOn(transport, "request").mockImplementation(async (input) => {
    await beforeRead?.();
    if (rejected)
      return {
        statusCode: 401,
        headers: {},
        body: JSON.stringify({ code: 20003, message: "Owned test rejection" }),
      };
    const path = new URL(input.uri).pathname;
    let body: unknown;
    if (path.endsWith("/PhoneNumbers")) {
      body = {
        phone_numbers: livePhones.map((phone_number) => ({ phone_number })),
        meta: { key: "phone_numbers", next_page_url: null },
      };
    } else if (
      path.endsWith("/ChannelSenders") &&
      input.method.toUpperCase() === "POST"
    ) {
      liveChannels.push(senderSid);
      body = { sid: senderSid };
    } else if (path.endsWith("/ChannelSenders")) {
      body = {
        channel_senders: liveChannels.map((sid) => ({ sid })),
        meta: { key: "channel_senders", next_page_url: null },
      };
    } else {
      throw new Error(`Unexpected owned SDK request ${input.method} ${path}`);
    }
    return {
      statusCode: input.method.toUpperCase() === "POST" ? 201 : 200,
      headers: {},
      body: JSON.stringify(body),
    };
  });
  sdk = new Twilio(`AC${"3".repeat(32)}`, "owned-test-token", {
    httpClient: transport,
  });
}

describe("interactive sender snapshots through installed Twilio SDK", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T09:00:00Z"));
    setupData();
    livePhones = [phone];
    liveChannels = [];
    rejected = false;
    beforeRead = undefined;
    invalidateWorkspaceTwilioData("w1");
    invalidateWorkspaceTwilioData("w2");
    installTransport();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("ten serial interactive checks use one phone-list request", async () => {
    for (let i = 0; i < 10; i++) await assertWorkspaceCanSendSms(interactive);
    expect(readCount()).toBe(1);
  });
  test("ten concurrent checks share one in-flight request", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => assertWorkspaceCanSendSms(interactive)),
    );
    expect(readCount()).toBe(1);
  });
  test("reuses at 29,999ms and refreshes at the 30,000ms boundary", async () => {
    await verifyWorkspaceMessagingSenderPool(interactive);
    vi.advanceTimersByTime(29_999);
    livePhones = [];
    expect((await verifyWorkspaceMessagingSenderPool(interactive)).inSync).toBe(
      true,
    );
    expect(readCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect((await verifyWorkspaceMessagingSenderPool(interactive)).inSync).toBe(
      false,
    );
    expect(readCount()).toBe(2);
  });
  test("failed provider reads never become ready cache entries", async () => {
    rejected = true;
    await expect(assertWorkspaceCanSendSms(interactive)).rejects.toThrow();
    rejected = false;
    await expect(
      assertWorkspaceCanSendSms(interactive),
    ).resolves.toBeUndefined();
    expect(readCount()).toBe(2);
  });
  test("two workspaces with the same service each get their own read", async () => {
    await verifyWorkspaceMessagingSenderPool(interactive);
    livePhones = [];
    const other = await verifyWorkspaceMessagingSenderPool({
      ...interactive,
      workspaceId: "w2",
    });
    expect(other.inSync).toBe(false);
    expect((await verifyWorkspaceMessagingSenderPool(interactive)).inSync).toBe(
      true,
    );
    expect(readCount()).toBe(2);
  });
  test.each([
    "credentials",
    "phone attached",
    "phone removed",
    "service",
    "account",
  ])("%s invalidation refreshes within the TTL", async (change) => {
    await verifyWorkspaceMessagingSenderPool(interactive);
    if (change === "credentials")
      fixture.data.authToken = "rotated-owned-test-token";
    if (change === "phone attached")
      onboarding().messagingService.attachedSenderPhoneNumbers.push(
        "+15555551213",
      );
    if (change === "phone removed")
      onboarding().messagingService.attachedSenderPhoneNumbers = [];
    if (change === "service")
      onboarding().messagingService.serviceSid = `MG${"4".repeat(32)}`;
    if (change === "account") fixture.data.sid = `AC${"5".repeat(32)}`;
    invalidateWorkspaceTwilioData("w1");
    const result = await verifyWorkspaceMessagingSenderPool(interactive);
    expect(readCount()).toBe(2);
    if (change === "phone attached")
      expect(result.missingFromPool).toEqual(["+15555551213"]);
    if (change === "phone removed") expect(result.extraInPool).toEqual([phone]);
    if (change === "service")
      expect(request.mock.calls.at(-1)?.[0].uri).toContain(
        `MG${"4".repeat(32)}`,
      );
  });
  test.each(["service", "account_sid", "expected senders", "RCS sender"])(
    "a fresh stored %s separates a still-valid provider snapshot",
    async (change) => {
      await verifyWorkspaceMessagingSenderPool(interactive);
      vi.advanceTimersByTime(55_000);
      await verifyWorkspaceMessagingSenderPool(interactive);
      if (change === "service")
        onboarding().messagingService.serviceSid = `MG${"4".repeat(32)}`;
      if (change === "account_sid") {
        delete fixture.data.sid;
        fixture.data.account_sid = `AC${"5".repeat(32)}`;
      }
      if (change === "expected senders")
        onboarding().messagingService.attachedSenderPhoneNumbers = [];
      if (change === "RCS sender") onboarding().rcs.senderId = senderSid;
      vi.advanceTimersByTime(6_000);
      const result = await verifyWorkspaceMessagingSenderPool(interactive);
      expect(readCount()).toBe(change === "RCS sender" ? 4 : 3);
      if (change === "expected senders")
        expect(result.extraInPool).toEqual([phone]);
      if (change === "RCS sender") expect(result.rcsSenderId).toBe(senderSid);
    },
  );
  test("changed config rejects every caller waiting on the old request", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforeRead = async () => {
      entered();
      await pending;
    };
    const results = Promise.allSettled([
      assertWorkspaceCanSendSms(interactive),
      assertWorkspaceCanSendSms(interactive),
    ]);
    await started;
    invalidateWorkspaceTwilioData("w1");
    release();
    expect((await results).map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    beforeRead = undefined;
    await assertWorkspaceCanSendSms(interactive);
    expect(readCount()).toBe(2);
  });
  test("RCS bursts share both phone and channel list requests", async () => {
    onboarding().rcs.senderId = senderSid;
    invalidateWorkspaceTwilioData("w1");
    liveChannels = [senderSid];
    for (let i = 0; i < 10; i++)
      expect(
        (await verifyWorkspaceMessagingSenderPool(interactive)).rcsSenderInPool,
      ).toBe(true);
    expect(readCount()).toBe(2);
  });
  test("RCS attachment invalidates an earlier missing-sender result", async () => {
    onboarding().rcs.senderId = senderSid;
    invalidateWorkspaceTwilioData("w1");
    expect(
      (await verifyWorkspaceMessagingSenderPool(interactive)).rcsSenderInPool,
    ).toBe(false);
    await attachWorkspaceRcsSenderToPool({ workspaceId: "w1" });
    expect(
      (await verifyWorkspaceMessagingSenderPool(interactive)).rcsSenderInPool,
    ).toBe(true);
    expect(
      request.mock.calls.filter(
        ([input]) => input.method.toUpperCase() === "POST",
      ),
    ).toHaveLength(1);
    expect(readCount()).toBe(5);
  });
  test("manual verification reads fresh and drops the older interactive result", async () => {
    await verifyWorkspaceMessagingSenderPool(interactive);
    livePhones = [];
    expect(
      (await verifyWorkspaceMessagingSenderPool({ workspaceId: "w1" })).inSync,
    ).toBe(false);
    expect((await verifyWorkspaceMessagingSenderPool(interactive)).inSync).toBe(
      false,
    );
    expect(readCount()).toBe(3);
  });
  test("default campaign gate checks remain fresh on each evaluation", async () => {
    await assertWorkspaceCanSendSms({ workspaceId: "w1" });
    livePhones = [];
    await expect(
      assertWorkspaceCanSendSms({ workspaceId: "w1" }),
    ).rejects.toThrow("sender");
    expect(readCount()).toBe(2);
  });
  test("cached provider readiness cannot retain approval after a config write", async () => {
    await assertWorkspaceCanSendSms(interactive);
    onboarding().a2p10dlc.status = "rejected";
    invalidateWorkspaceTwilioData("w1");
    await expect(assertWorkspaceCanSendSms(interactive)).rejects.toThrow(
      "not approved",
    );
  });
  test.each([true, null])(
    "cached sender success cannot override toll-free value %s",
    async (blocked) => {
      await assertWorkspaceCanSendSms(interactive);
      fixture.data.portalSync = {
        lastSyncStatus: "healthy",
        tollFreeVerificationBlocked: blocked,
        tollFreeVerificationCheckedAt: "2026-10-07T09:00:00Z",
      };
      invalidateWorkspaceTwilioData("w1");
      await expect(assertWorkspaceCanSendSms(interactive)).rejects.toThrow(
        "Toll-free verification",
      );
    },
  );
  test("callers cannot mutate the stored sender result", async () => {
    const result = await verifyWorkspaceMessagingSenderPool(interactive);
    result.livePhoneNumbers.length = 0;
    result.inSync = false;
    const next = await verifyWorkspaceMessagingSenderPool(interactive);
    expect(next.inSync).toBe(true);
    expect(next.livePhoneNumbers).toEqual([phone]);
    expect(readCount()).toBe(1);
  });
  test("unset services perform no provider requests", async () => {
    onboarding().messagingService.serviceSid = null;
    invalidateWorkspaceTwilioData("w1");
    expect(
      (await verifyWorkspaceMessagingSenderPool(interactive)).serviceSid,
    ).toBeNull();
    expect(readCount()).toBe(0);
  });
});
