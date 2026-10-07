import { randomUUID } from "node:crypto";
import postgres from "postgres";
import RequestClient from "twilio/lib/base/RequestClient";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { onboardingFixture } from "../fixtures/onboarding";

const originalEnv = vi.hoisted(() => ({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
}));
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID();
const actorId = randomUUID();
const accountSid = `AC${"3".repeat(32)}`;
const serviceSid = `MG${"1".repeat(32)}`;
const senderSid = `XE${"2".repeat(32)}`;
const phone = "+15555551212";
let sql: postgres.Sql;
let chat: typeof import("@/lib/chat-sms.server");
let data: typeof import("@/lib/merge-workspace-twilio-data.server");
let senderPool: typeof import("@/lib/twilio-sender-pool.server");
let pools: typeof import("@/server/db");
let livePhones: string[], liveChannels: string[];
let rejected: boolean;
let beforeRead: (() => Promise<void>) | undefined;
let clock: number;
let sequence = 0;
let request: ReturnType<typeof vi.spyOn<RequestClient, "request">>;
function configuration() {
  const state = onboardingFixture();
  return {
    sid: accountSid,
    authToken: "owned-cache-token",
    portalConfig: {
      sendMode: "messaging_service",
      messagingServiceSid: serviceSid,
    },
    portalSync: {
      lastSyncStatus: "healthy",
      tollFreeVerificationBlocked: false,
      tollFreeVerificationCheckedAt: new Date().toISOString(),
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
async function storedCount() {
  const [row] =
    await sql`select count(*)::int as n from message where workspace=${workspaceId}`;
  return row.n;
}
function getReads() {
  return request.mock.calls.filter(
    ([input]) => input.method.toUpperCase() === "GET",
  ).length;
}
function getSends() {
  return request.mock.calls.filter(
    ([input]) =>
      input.method.toUpperCase() === "POST" &&
      input.uri.endsWith("/Messages.json"),
  ).length;
}
async function send() {
  return chat.sendMessage({
    body: "Owned cache test",
    to: "+15555551213",
    from: "",
    media: "",
    workspace: workspaceId,
    contact_id: "",
    user: null,
  });
}

describe.skipIf(!databaseUrl)(
  "interactive sender cache with real chat persistence (#2151)",
  () => {
    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Database URL required");
      process.env.DATABASE_URL = databaseUrl;
      process.env.DATABASE_DIRECT_URL = databaseUrl;
      sql = postgres(databaseUrl, { max: 2 });
      await sql`insert into workspace (id,name,credits,twilio_data,disabled,feature_flags,key,token)
      values (${workspaceId}::uuid,${`owned-cache-${workspaceId}`},100,'{}'::jsonb,false,'{}'::jsonb,${`SK${"4".repeat(32)}`},'owned-api-secret')`;
      await sql`insert into "user" (id,username) values (${actorId}::uuid,${`owned-cache-${actorId}@example.test`})`;
      await sql`insert into workspace_member (id,workspace_id,user_id,role_id) values (${`owned-cache-${actorId}`},${workspaceId},${actorId},'owner')`;
      chat = await import("@/lib/chat-sms.server");
      data = await import("@/lib/merge-workspace-twilio-data.server");
      senderPool = await import("@/lib/twilio-sender-pool.server");
      pools = await import("@/server/db");
    });
    beforeEach(async () => {
      await sql`delete from workspace_events where workspace_id=${workspaceId}::uuid`;
      await sql`delete from message where workspace=${workspaceId}`;
      await sql`delete from job where workspace_id=${workspaceId}::uuid`;
      await sql`delete from outreach_attempt where workspace=${workspaceId}`;
      await sql`delete from campaign_queue where workspace=${workspaceId}`;
      await sql`delete from contact where workspace=${workspaceId}`;
      await sql`delete from campaign where workspace=${workspaceId}`;
      await data.persistWorkspaceTwilioData(workspaceId, configuration());
      livePhones = [phone];
      liveChannels = [];
      rejected = false;
      beforeRead = undefined;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-07T16:00:00Z"));
      clock = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => clock);
      request = vi
        .spyOn(RequestClient.prototype, "request")
        .mockImplementation(async (input) => {
          const path = new URL(input.uri).pathname;
          if (input.method.toUpperCase() === "GET") await beforeRead?.();
          if (rejected)
            return {
              statusCode: 401,
              headers: {},
              body: JSON.stringify({
                code: 20003,
                message: "Owned provider denial",
              }),
            };
          let body: unknown;
          if (path.endsWith("/PhoneNumbers")) {
            body = {
              phone_numbers: livePhones.map((phone_number) => ({
                phone_number,
              })),
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
          } else if (
            path.endsWith("/Messages.json") &&
            input.method.toUpperCase() === "POST"
          ) {
            body = {
              sid: `SM${String(++sequence).padStart(32, "0")}`,
              account_sid: accountSid,
              messaging_service_sid: serviceSid,
              body: "Owned cache test",
              to: "+15555551213",
              from: phone,
              direction: "outbound-api",
              status: "queued",
              date_created: new Date().toISOString(),
            };
          } else {
            throw new Error(
              `Unexpected owned SDK request ${input.method} ${path}`,
            );
          }
          return {
            statusCode: input.method.toUpperCase() === "POST" ? 201 : 200,
            headers: {},
            body: JSON.stringify(body),
          };
        });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });
    afterAll(async () => {
      try {
        if (sql) {
          await sql`delete from workspace_events where workspace_id=${workspaceId}::uuid`;
          await sql`delete from message where workspace=${workspaceId}`;
          await sql`delete from job where workspace_id=${workspaceId}::uuid`;
          await sql`delete from outreach_attempt where workspace=${workspaceId}`;
          await sql`delete from campaign_queue where workspace=${workspaceId}`;
          await sql`delete from contact where workspace=${workspaceId}`;
          await sql`delete from campaign where workspace=${workspaceId}`;
          await sql`delete from workspace_member where workspace_id=${workspaceId}`;
          await sql`delete from workspace where id=${workspaceId}::uuid`;
          await sql`delete from "user" where id=${actorId}::uuid`;
        }
      } finally {
        if (pools)
          await Promise.all([pools.pool.end(), pools.directPool.end()]);
        if (sql) await sql.end();
        for (const [name, value] of Object.entries(originalEnv)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    });
    async function campaignBatch() {
      const [campaign] = await sql`insert into campaign
        (workspace,title,type,status,end_date,body_text,sms_send_mode,sms_messaging_service_sid)
        values (${workspaceId},'Owned sender cost','message','running',${new Date(Date.now() + 86400000).toISOString()},
          'Owned cache test','messaging_service',${serviceSid}) returning id`;
      for (let i = 0; i < 3; i++) {
        const [contact] =
          await sql`insert into contact (workspace,phone,line_type)
          values (${workspaceId},${`+1416555121${i}`},'mobile') returning id`;
        await sql`insert into campaign_queue (workspace,campaign_id,contact_id,queue_state,attempts,attempt_count)
          values (${workspaceId},${campaign.id},${contact.id},'queued',0,0)`;
      }
      const { dispatchCampaignSmsBatch } =
        await import("@/lib/campaign-sms-dispatch.server");
      return dispatchCampaignSmsBatch({
        workspaceId,
        campaignId: String(campaign.id),
        userId: actorId,
        maxContacts: 3,
      });
    }
    test("a representative campaign tick reads readiness once for three persisted sends", async () => {
      const result = await campaignBatch();
      const persisted = await storedCount();
      console.info(
        "owned-sender-cost",
        JSON.stringify({
          surface: "campaign",
          recipients: 3,
          providerReads: getReads(),
          providerSends: getSends(),
          persisted,
        }),
      );
      expect(result.kind).toBe("dispatched");
      expect(result.kind === "dispatched" && result.counts.sent).toBe(3);
      expect(getReads()).toBe(1);
      expect(getSends()).toBe(3);
      expect(persisted).toBe(3);
    });
    test("non-ready campaign defers all three rows without spending attempts", async () => {
      livePhones = [];
      const result = await campaignBatch();
      expect(result.kind).toBe("deferred");
      expect(getReads()).toBe(1);
      expect(getSends()).toBe(0);
      expect(await storedCount()).toBe(0);
      const rows =
        await sql`select attempt_count,attempts,queue_state,dequeued_at from campaign_queue where workspace=${workspaceId}`;
      expect(rows).toHaveLength(3);
      for (const row of rows)
        expect(row).toMatchObject({
          attempt_count: 0,
          attempts: "0",
          queue_state: "queued",
          dequeued_at: null,
        });
    });
    test("ten serial chat sends perform one pool read and persist ten accepted messages", async () => {
      for (let i = 0; i < 10; i++) await send();
      const persisted = await storedCount();
      console.info(
        "owned-sender-cost",
        JSON.stringify({
          surface: "chat",
          recipients: 10,
          providerReads: getReads(),
          providerSends: getSends(),
          persisted,
        }),
      );
      expect(getReads()).toBe(1);
      expect(getSends()).toBe(10);
      expect(persisted).toBe(10);
    });
    test("ten concurrent chat sends share the read and retain all message intents", async () => {
      await Promise.all(Array.from({ length: 10 }, send));
      const persisted = await storedCount();
      console.info(
        "owned-sender-cost",
        JSON.stringify({
          surface: "chat",
          recipients: 10,
          providerReads: getReads(),
          providerSends: getSends(),
          persisted,
        }),
      );
      expect(getReads()).toBe(1);
      expect(getSends()).toBe(10);
      expect(persisted).toBe(10);
    });
    test("expired sender information blocks before a second message intent", async () => {
      await send();
      livePhones = [];
      clock += 30_000;
      await expect(send()).rejects.toThrow("sender");
      expect(getReads()).toBe(2);
      expect(getSends()).toBe(1);
      expect(await storedCount()).toBe(1);
    });
    test("stored A2P rejection blocks the next send within the TTL", async () => {
      await send();
      await data.mergeWorkspaceTwilioData(workspaceId, (current) => {
        const onboarding = current.onboarding as ReturnType<
          typeof onboardingFixture
        >;
        return {
          ...current,
          onboarding: {
            ...onboarding,
            a2p10dlc: { ...onboarding.a2p10dlc, status: "rejected" },
          },
        };
      });
      await expect(send()).rejects.toThrow("not approved");
      expect(getSends()).toBe(1);
      expect(await storedCount()).toBe(1);
    });
    test("stored toll-free denial blocks without another message intent", async () => {
      await send();
      await data.mergeWorkspaceTwilioData(workspaceId, (current) => ({
        ...current,
        portalSync: { tollFreeVerificationBlocked: true },
      }));
      await expect(send()).rejects.toThrow("Toll-free verification");
      expect(getSends()).toBe(1);
      expect(await storedCount()).toBe(1);
    });
    test("credential rotation invalidates the prior provider snapshot", async () => {
      await send();
      await sql`update workspace set key=${`SK${"5".repeat(32)}`},token='rotated-owned-secret' where id=${workspaceId}::uuid`;
      data.invalidateWorkspaceTwilioData(workspaceId);
      await send();
      expect(getReads()).toBe(2);
      expect(getSends()).toBe(2);
      expect(await storedCount()).toBe(2);
      expect(request.mock.calls.at(-1)?.[0].username).toBe(
        `SK${"5".repeat(32)}`,
      );
    });
    test("failed readiness creates no message intent and is not cached", async () => {
      rejected = true;
      await expect(send()).rejects.toThrow();
      expect(await storedCount()).toBe(0);
      expect(getSends()).toBe(0);
      rejected = false;
      await send();
      expect(getReads()).toBe(2);
      expect(getSends()).toBe(1);
      expect(await storedCount()).toBe(1);
    });
    test("configuration invalidation during a read prevents provider send and persistence", async () => {
      let release!: () => void, entered!: () => void;
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
      const result = send().then(
        () => "sent",
        () => "refused",
      );
      await started;
      await data.persistWorkspaceTwilioData(workspaceId, configuration());
      release();
      expect(await result).toBe("refused");
      expect(getSends()).toBe(0);
      expect(await storedCount()).toBe(0);
    });
    test("RCS attach refreshes the cached missing sender using the committed workspace state", async () => {
      const current = configuration();
      current.onboarding.rcs.senderId = senderSid;
      await data.persistWorkspaceTwilioData(workspaceId, current);
      const args = { workspaceId, reuseProviderSnapshot: true };
      expect(
        (await senderPool.verifyWorkspaceMessagingSenderPool(args))
          .rcsSenderInPool,
      ).toBe(false);
      await senderPool.attachWorkspaceRcsSenderToPool({ workspaceId });
      expect(
        (await senderPool.verifyWorkspaceMessagingSenderPool(args))
          .rcsSenderInPool,
      ).toBe(true);
      expect(getReads()).toBe(5);
    });
  },
);
