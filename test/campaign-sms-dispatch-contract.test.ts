/**
 * Shared policy contract for campaign SMS dispatch (#1270 slice 1).
 *
 * The single `dispatchCampaignSmsBatch` coordinator is reached from two
 * adapters: the `/api/sms` HTTP route and the worker `campaign_dispatch`
 * handler. Both must apply every send gate identically — a divergence would
 * mean the same campaign behaves differently depending on which surface
 * launched it.
 *
 * Existing coverage:
 *   - test/sms-action.route.test.ts exercises policy through the HTTP
 *     adapter only (worker path unverified).
 *   - test/campaign-dispatch-worker.test.ts exercises the worker's
 *     orchestration around the coordinator, but mocks the coordinator itself
 *     — so policy through the worker adapter is entirely unverified.
 *
 * This file closes the gap by driving one fixture list through BOTH adapters
 * against the same mocked dependencies and asserting they produce the same
 * downstream calls. Follow-up PRs for in-batch dedup, real MPS pacing, and
 * exact next-window scheduling each add rows here rather than growing a
 * second suite.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";
import { TEST_WORKSPACE_ID } from "./helpers/public-api-fixtures";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// ---------------------------------------------------------------------------
// Mocks — union of what both adapters and the real coordinator need. The
// coordinator itself is NEVER mocked here; that would defeat the point of a
// shared contract.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // HTTP-adapter deps
  verifyApiKeyOrSession: vi.fn(),
  parseJsonBodyOrResponse: vi.fn(),
  requireWorkspaceAccess: vi.fn(),

  // Coordinator deps (shared)
  getWorkspaceCreditsBalance: vi.fn(async () => 100),
  loadCampaignSmsDispatchData: vi.fn(),
  getCampaignQueueById: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  dequeueQueueEntry: vi.fn(async () => undefined),
  countCampaignMessagesToPhone: vi.fn(async () => 0),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ campaign_id: 1 })),
  rpcCreateOutreachAttempt: vi.fn(async () => 1),
  persistMessageRecord: vi.fn(async () => ({ data: [{ id: 1 }], error: null })),
  createSignedObjectUrl: vi.fn(async (_bucket: string, key: string) => `signed:${key}`),
  getOrLookupLineType: vi.fn(async () => null as string | null),

  // Worker-adapter deps
  findCampaignInWorkspace: vi.fn(),
  updateCampaignStatusInWorkspace: vi.fn(async () => undefined),
  rpcTryCompleteCampaignIfDrained: vi.fn(async () => true),
  rpcFailExhaustedCampaignQueueContacts: vi.fn(async () => 0),
  recordQueueAttemptFailure: vi.fn(async () => undefined),
  createTenantDb: vi.fn(() => ({ tenant: true })),
  enqueueJob: vi.fn(async () => ({ enqueued: true, jobId: 99 })),

  isWithinSendWindow: vi.fn(() => true),
  nextSendWindowOpenAt: vi.fn(() => null),

  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  env: { BASE_URL: () => "https://app.example" },
}));

// Wall-clock-dependent gate: pin open so scenarios are not time-of-day sensitive
// (recipient-window logic has its own test).
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: vi.fn(() => ({
    allowed: true,
    timezone: "America/Toronto",
    reason: "in_window",
  })),
  isWithinRecipientCallingWindow: vi.fn(() => true),
}));

vi.mock("@/lib/capability-guard.server", () => ({
  requireDualAuthCapability: async () => ({ type: "ok" }),
  requireDataPlaneCapability: async () => ({ type: "ok" }),
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: unknown[]) => mocks.verifyApiKeyOrSession(...args),
}));
vi.mock("@/lib/api-parse.server", () => ({
  parseJsonBodyOrResponse: (...args: unknown[]) => mocks.parseJsonBodyOrResponse(...args),
}));
vi.mock("@/lib/database/campaign.server", () => ({
  getCampaignQueueById: (...args: unknown[]) => mocks.getCampaignQueueById(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) => mocks.getWorkspaceTwilioPortalConfig(...args),
  createWorkspaceTwilioInstance: (...args: unknown[]) => mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
  recordQueueAttemptFailure: (...args: unknown[]) => mocks.recordQueueAttemptFailure(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  countCampaignMessagesToPhone: (...args: unknown[]) => mocks.countCampaignMessagesToPhone(...args),
  // Intent-row helpers (#1582): the contract covers dispatch gates and pacing,
  // so the row lifecycle is stubbed as a success here.
  pendingMessageSid: (ref: string) => `pending:${ref}`,
  resolveMessageByClientRef: vi.fn(async (_ws: string, _ref: string, update: { sid: string }) => ({ id: 1, ...update })),
  deleteMessageByClientRef: vi.fn(async () => undefined),
}));
vi.mock("@/lib/sms-campaign-db.server", () => ({
  loadCampaignSmsDispatchData: (...args: unknown[]) => mocks.loadCampaignSmsDispatchData(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  updateOutreachAttemptForWorkspace: (...args: unknown[]) => mocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/twilio-readiness.server", () => ({
  assertWorkspaceCanSendSms: vi.fn(async () => undefined),
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/sms-send.server", () => ({
  persistMessageRecord: (...args: unknown[]) => mocks.persistMessageRecord(...args),
  twilioMessageToPersistFields: (message: any, extras: any) => ({ ...message, ...extras }),
  buildMessageInsert: (fields: Record<string, unknown>) => fields,
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...args: unknown[]) => mocks.rpcCreateOutreachAttempt(...args),
  rpcTryCompleteCampaignIfDrained: (...args: unknown[]) => mocks.rpcTryCompleteCampaignIfDrained(...args),
  rpcFailExhaustedCampaignQueueContacts: (...args: unknown[]) =>
    mocks.rpcFailExhaustedCampaignQueueContacts(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...args: unknown[]) => mocks.createTenantDb(...args),
}));
vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: unknown[]) => mocks.getWorkspaceCreditsBalance(...args),
}));
vi.mock("@/lib/twilio-lookup.server", () => ({
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: (lineType: string | null | undefined) =>
    lineType === "landline" || lineType === "fax",
}));
vi.mock("@/lib/campaign-send-window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-send-window")>();
  return {
    ...actual,
    isWithinSendWindow: (...args: unknown[]) => mocks.isWithinSendWindow(...args),
    nextSendWindowOpenAt: (...args: unknown[]) => mocks.nextSendWindowOpenAt(...args),
  };
});
vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: (...args: unknown[]) => mocks.findCampaignInWorkspace(...args),
  updateCampaignStatusInWorkspace: (...args: unknown[]) => mocks.updateCampaignStatusInWorkspace(...args),
}));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));
// Sibling worker handlers pull heavy deps; stub them out.
vi.mock("@/lib/audience-upload-process.server", () => ({
  processAudienceUpload: vi.fn(),
}));
vi.mock("@/lib/campaign-export.server", () => ({
  processCallCampaignExport: vi.fn(),
  processMessageCampaignExport: vi.fn(),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: vi.fn(),
}));
vi.mock("@/lib/twilio-compliance-job.server", () => ({
  runWorkspaceTwilioComplianceJob: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const basePortal = makePortalConfig();
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000002";
const CAMPAIGN_ID = 42;

function baseCampaignData() {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      end_date: null,
      sms_send_mode: null,
      sms_send_window: null,
      caller_id: "+15550000000",
    },
    body_text: "Hello {{firstname}}",
    message_media: [],
  };
}

type QueueMember = {
  id: number;
  contact_id: number;
  contact: { id: number; phone: string; firstname: string; opt_out: boolean };
};

type Scenario = {
  name: string;
  queue: QueueMember[];
  seed?: () => void;
  expect: {
    dequeueReasons: string[];
    sendsAttempted: number;
  };
};

const SCENARIOS: Scenario[] = [
  {
    name: "opted-out contact is dequeued (opt-out reason), not sent",
    queue: [
      {
        id: 501,
        contact_id: 9,
        contact: { id: 9, phone: "+15551234567", firstname: "A", opt_out: true },
      },
    ],
    expect: {
      dequeueReasons: ["Contact opted out"],
      sendsAttempted: 0,
    },
  },
  {
    name: "eligible contact sends and is dequeued with sent-reason",
    queue: [
      {
        id: 502,
        contact_id: 10,
        contact: { id: 10, phone: "+15557654321", firstname: "B", opt_out: false },
      },
    ],
    expect: {
      // Actual sent-reason string comes from campaign-sms-send.server.ts;
      // assert on prefix ("SMS message") rather than pinning the exact copy.
      dequeueReasons: ["SMS message sent"],
      sendsAttempted: 1,
    },
  },
  {
    // In-batch dedup: two queue rows for two different contact IDs sharing
    // one normalized phone. Persistent duplicate check cannot see the sibling
    // still executing in the same call — the in-memory reservation must.
    name: "two rows sharing one normalized phone: first sends, second dequeues as duplicate",
    queue: [
      {
        id: 601,
        contact_id: 20,
        contact: { id: 20, phone: "+15556667777", firstname: "First", opt_out: false },
      },
      {
        id: 602,
        contact_id: 21,
        // Same normalized number as above (different formatting).
        contact: { id: 21, phone: "(555) 666-7777", firstname: "Second", opt_out: false },
      },
    ],
    expect: {
      // Order: first row sends and dequeues as sent; second row dequeues as
      // duplicate. Order is deterministic because handleMember reserves the
      // number synchronously before its first await.
      dequeueReasons: ["Duplicate SMS prevented", "SMS message sent"],
      sendsAttempted: 1,
    },
  },
];

function seedCommonMocks() {
  for (const fn of Object.values(mocks)) {
    if (typeof fn === "function" && "mockReset" in fn) {
      (fn as any).mockReset?.();
    }
  }

  mocks.verifyApiKeyOrSession.mockResolvedValue({
    authType: "session",
    user: { id: USER_ID },
  });
  mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  mocks.getWorkspaceCreditsBalance.mockResolvedValue(100);
  mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
    ...basePortal,
    parallelDispatchEnabled: false,
  });
  mocks.createWorkspaceTwilioInstance.mockResolvedValue({
    messages: { create: vi.fn(async (args: any) => ({ sid: "SM1", ...args })) },
  });
  mocks.dequeueQueueEntry.mockResolvedValue(undefined);
  mocks.countCampaignMessagesToPhone.mockResolvedValue(0);
  mocks.updateOutreachAttemptForWorkspace.mockResolvedValue({ campaign_id: 1 });
  mocks.rpcCreateOutreachAttempt.mockResolvedValue(1);
  mocks.persistMessageRecord.mockResolvedValue({ data: [{ id: 1 }], error: null });
  mocks.getOrLookupLineType.mockResolvedValue(null);
  mocks.findCampaignInWorkspace.mockResolvedValue({
    id: CAMPAIGN_ID,
    type: "message",
    status: "running",
    end_date: null,
  });
  mocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(true);
  mocks.enqueueJob.mockResolvedValue({ enqueued: true, jobId: 99 });
  mocks.isWithinSendWindow.mockReturnValue(true);
  mocks.nextSendWindowOpenAt.mockReturnValue(null);
  mocks.logger.info.mockClear();
  mocks.logger.warn.mockClear();
  mocks.logger.error.mockClear();
}

async function runHttpAdapter() {
  mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
    campaign_id: String(CAMPAIGN_ID),
    workspace_id: TEST_WORKSPACE_ID,
    caller_id: "+15550000000",
  });
  const mod = await import("../app/routes/api+/sms.action.server");
  const res = await asRouteResponse(
    mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
  );
  expect(res.status).toBe(200);
  return res;
}

async function runWorkerAdapter() {
  const { campaignDispatchHandler } = await import("@/lib/worker/handlers/campaign.server");
  const job = {
    id: 7,
    type: "campaign_dispatch",
    params: { campaignId: CAMPAIGN_ID, workspaceId: TEST_WORKSPACE_ID, userId: USER_ID },
    workspace_id: TEST_WORKSPACE_ID,
    user_id: USER_ID,
    attempt_count: 0,
    max_attempts: 3,
  } as any;
  return campaignDispatchHandler(job, job.params);
}

function assertDequeueContract(expected: string[]) {
  // Dequeue order is timing-dependent (fast sync dedup vs. multi-await send
  // path), and start pacing changes which fires first. Assert on the
  // MULTISET of reasons, not the sequence.
  const actual = mocks.dequeueQueueEntry.mock.calls
    .map((c) => (c[0] as any).reason as string)
    .sort();
  expect(actual).toEqual([...expected].sort());
}

function assertSendContract(expectedSends: number) {
  // A send goes through persistMessageRecord + createWorkspaceTwilioInstance.
  // Assert on the twilio-client build count as the crisp signal.
  expect(mocks.createWorkspaceTwilioInstance.mock.calls.length).toBe(
    expectedSends > 0 ? 1 : 0,
  );
  expect(mocks.rpcCreateOutreachAttempt.mock.calls.length).toBe(expectedSends);
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

describe.each(SCENARIOS)("SMS dispatch contract — $name", (scenario) => {
  beforeEach(() => {
    vi.resetModules();
    seedCommonMocks();
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue(scenario.queue);
    scenario.seed?.();
  });

  test("HTTP adapter applies gates identically", async () => {
    await runHttpAdapter();
    assertDequeueContract(scenario.expect.dequeueReasons);
    assertSendContract(scenario.expect.sendsAttempted);
  });

  test("worker adapter applies gates identically", async () => {
    const result = (await runWorkerAdapter()) as { ok: true; sent: number; dequeued: number };
    assertDequeueContract(scenario.expect.dequeueReasons);
    assertSendContract(scenario.expect.sendsAttempted);
    // Worker exposes the coordinator's counts; verify they match the fixture.
    expect(result.sent).toBe(scenario.expect.sendsAttempted);
  });
});

// ---------------------------------------------------------------------------
// Send-window deferral has different observable outcomes per adapter — the
// HTTP response body vs. worker successor enqueue — so it's not a shape-fits-
// all `SCENARIOS` row. Both adapters must still refuse to send or dequeue any
// row, and both must carry the exact `nextOpenAt` boundary forward.
// ---------------------------------------------------------------------------

describe("SMS dispatch contract — outside send window defers both adapters", () => {
  const NEXT_OPEN = new Date("2026-08-30T12:00:00Z");

  beforeEach(() => {
    vi.resetModules();
    seedCommonMocks();
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      ...baseCampaignData(),
      campaign: { ...baseCampaignData().campaign, sms_send_window: "any" },
    });
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 701,
        contact_id: 30,
        contact: { id: 30, phone: "+15559990000", firstname: "Q", opt_out: false },
      },
    ]);
    mocks.isWithinSendWindow.mockReturnValue(false);
    mocks.nextSendWindowOpenAt.mockReturnValue(NEXT_OPEN);
  });

  test("HTTP adapter returns deferred body carrying nextOpenAt, dequeues nothing", async () => {
    const res = await runHttpAdapter();
    const body = (await res.json()) as { deferred: boolean; nextOpenAt: string };
    expect(body.deferred).toBe(true);
    expect(body.nextOpenAt).toBe(NEXT_OPEN.toISOString());
    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
  });

  test("worker adapter enqueues successor at exact next-open, dequeues nothing", async () => {
    const result = (await runWorkerAdapter()) as { ok: true; deferred: string };
    expect(result.deferred).toBe("send_window");
    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();

    // enqueueDispatchSuccessor turns delayMs into runAt = now + delay,
    // capped at SEND_WINDOW_MAX_DEFER_MS = 60min (worker-side). Assert the
    // resulting Date sits within the expected band.
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    const enqueueArgs = mocks.enqueueJob.mock.calls[0][0] as { runAt: Date };
    const cap = 60 * 60 * 1000;
    const uncappedRemaining = Math.max(0, NEXT_OPEN.getTime() - Date.now());
    const expected = Math.min(uncappedRemaining, cap);
    const observedDelay = enqueueArgs.runAt.getTime() - Date.now();
    // observedDelay should be ~expected, within a small wall-clock slack.
    expect(observedDelay).toBeLessThanOrEqual(expected + 1000);
    expect(observedDelay).toBeGreaterThanOrEqual(expected - 2000);
  });
});

// ---------------------------------------------------------------------------
// MPS pacing is a coordinator-level property: contact-handler starts must be
// spaced by at least 1000/mps ms. Adapter identity doesn't matter — one test
// through the HTTP adapter with fake timers is sufficient signal.
// ---------------------------------------------------------------------------

describe("SMS dispatch contract — start rate does not exceed configured MPS", () => {
  beforeEach(() => {
    vi.resetModules();
    seedCommonMocks();
    // Portal at 1 MPS → 1000ms between contact starts.
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      ...basePortal,
      parallelDispatchEnabled: true,
      smsTargetMps: 1,
    });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 801,
        contact_id: 40,
        contact: { id: 40, phone: "+15551110001", firstname: "P1", opt_out: false },
      },
      {
        id: 802,
        contact_id: 41,
        contact: { id: 41, phone: "+15551110002", firstname: "P2", opt_out: false },
      },
      {
        id: 803,
        contact_id: 42,
        contact: { id: 42, phone: "+15551110003", firstname: "P3", opt_out: false },
      },
    ]);
  });

  test("three contacts at 60 MPS: rpcCreateOutreachAttempt starts are paced", async () => {
    // Real timers, small interval — the coordinator's minStartIntervalMs is
    // 1000/MPS, so this test uses MPS=50 (20ms) via the portal override in
    // beforeEach OVERRIDDEN below. Fake timers were tried first; module
    // hoisting means the coordinator captures the real setTimeout at import
    // time in some contexts, and vi.runAllTimersAsync then doesn't unblock
    // it. Real-time 60ms is faster than the mocked-dep chain anyway.
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      ...basePortal,
      parallelDispatchEnabled: true,
      smsTargetMps: 60, // ~16.7ms between starts
    });
    const startTimes: number[] = [];
    mocks.rpcCreateOutreachAttempt.mockImplementation(async () => {
      startTimes.push(Date.now());
      return 1;
    });

    await runHttpAdapter();

    expect(startTimes.length).toBe(3);
    const gaps = [startTimes[1] - startTimes[0], startTimes[2] - startTimes[1]];
    // ~16.7ms nominal; floor of 10ms absorbs setTimeout jitter on a busy CI
    // runner while still catching a coordinator that fires the whole batch
    // simultaneously (which would produce ~0ms gaps).
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Credit budget (#1483): the entry gate reads the balance once, but debits
// land after delivery, so every row in a batch would pass on the same stale
// balance. Both adapters must stop starting sends once the remaining balance
// cannot cover the next estimated message, and leave those rows queued.
// ---------------------------------------------------------------------------

const TWO_ELIGIBLE_ROWS: QueueMember[] = [
  {
    id: 701,
    contact_id: 30,
    contact: { id: 30, phone: "+15551110001", firstname: "One", opt_out: false },
  },
  {
    id: 702,
    contact_id: 31,
    contact: { id: 31, phone: "+15551110002", firstname: "Two", opt_out: false },
  },
];

describe("SMS dispatch contract — balance covers one send, not two", () => {
  beforeEach(() => {
    vi.resetModules();
    seedCommonMocks();
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue(TWO_ELIGIBLE_ROWS);
    // One-segment SMS costs 2 credits; a balance of 3 passes the entry gate
    // and affords exactly one send.
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(3);
  });

  test("HTTP adapter sends one row, leaves the other queued, and reports exhaustion", async () => {
    const res = await runHttpAdapter();
    const body = (await res.json()) as {
      responses: Record<string, { skipped?: boolean; reason?: string }>[];
      creditsExhausted: boolean;
    };
    expect(body.creditsExhausted).toBe(true);
    assertSendContract(1);
    assertDequeueContract(["SMS message sent"]);
    const skipped = body.responses.flatMap((r) => Object.values(r)).filter((r) => r.skipped);
    expect(skipped).toEqual([
      { success: false, skipped: true, reason: "Insufficient credits for the estimated message cost" },
    ]);
  });

  test("worker adapter stops the chain as insufficient credits after the affordable send", async () => {
    const result = await runWorkerAdapter();
    expect(result).toMatchObject({
      ok: true,
      blocked: "insufficient_credits",
      sent: 1,
      unaffordable: 1,
    });
    assertSendContract(1);
    assertDequeueContract(["SMS message sent"]);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Exhaustion (#1513): a send that fails records the attempt on its queue row
// and the batch runs the exhaustion sweep, so a row at the attempt maximum is
// dead-lettered and reported instead of pinning the chain to retries.
// ---------------------------------------------------------------------------

describe("SMS dispatch contract — a failing send records its attempt and the sweep dead-letters it", () => {
  beforeEach(() => {
    vi.resetModules();
    seedCommonMocks();
    mocks.loadCampaignSmsDispatchData.mockResolvedValue(baseCampaignData());
    mocks.getCampaignQueueById.mockResolvedValue([
      {
        id: 701,
        contact_id: 30,
        contact: { id: 30, phone: "+15551110001", firstname: "One", opt_out: false },
      },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      messages: { create: vi.fn(async () => { throw new Error("Twilio 30006 landline"); }) },
    });
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(1);
  });

  test("worker adapter reports the dead-lettered row and stops the chain cleanly", async () => {
    const result = await runWorkerAdapter();
    expect(mocks.recordQueueAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: 701, error: expect.stringContaining("30006") }),
    );
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, failed: 1, exhausted: 1, queuedRemaining: 0 });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    assertDequeueContract([]);
  });
});
