import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  requireOutboundCredits: vi.fn(),
  loadCampaignSmsDispatchData: vi.fn(),
  getCampaignQueueById: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  dequeueQueueEntry: vi.fn(),
  recordQueueAttemptFailure: vi.fn(),
  sendSingleCampaignSms: vi.fn(),
  hasDuplicateCampaignSms: vi.fn(),
  getOrLookupLineType: vi.fn(),
  createSignedObjectUrl: vi.fn(),
  rpcFailExhaustedCampaignQueueContacts: vi.fn(),
  // Exposed so a test can drive the rate and the claim-batch size. The
  // defaults here are what the existing spacing test relies on.
  configuredDispatcherSmsMps: vi.fn(),
  claimBatchSizeForRate: vi.fn(),
}));

vi.mock("@/lib/campaign-queue-claim.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/campaign-queue-claim.server")
  >()),
  // #2208: the dispatch claims the row before the provider call. These
  // suites cover gates, pacing and row failures, not claim contention,
  // and the real claim would go to the database.
  claimQueueEntryForSms: async () => true,
}));
vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
  recordQueueAttemptFailure: (...args: unknown[]) => mocks.recordQueueAttemptFailure(...args),
}));
vi.mock("@/lib/sms-campaign-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-campaign-db.server")>()),
  loadCampaignSmsDispatchData: (...args: unknown[]) => mocks.loadCampaignSmsDispatchData(...args),
}));
vi.mock("@/lib/database/campaign.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign.server")>()),
  getCampaignQueueById: (...args: unknown[]) => mocks.getCampaignQueueById(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) => mocks.getWorkspaceTwilioPortalConfig(...args),
}));
vi.mock("@/lib/sms-send-resolve", () => ({
  messageCampaignRequiresCallerId: vi.fn(() => false),
}));
vi.mock("@/lib/throughput-config.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/throughput-config.server")>()),
  claimBatchSizeForRate: (...args: unknown[]) => mocks.claimBatchSizeForRate(...args),
  configuredDispatcherSmsMps: (...args: unknown[]) => mocks.configuredDispatcherSmsMps(...args),
}));
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: vi.fn(() => ({
    allowed: true,
    timezone: "America/Toronto",
    reason: "in_window",
  })),
}));
vi.mock("@/lib/twilio-lookup.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-lookup.server")>()),
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: vi.fn(() => false),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/outbound-credit-gate.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-credit-gate.server")>()),
  requireOutboundCredits: (...args: unknown[]) => mocks.requireOutboundCredits(...args),
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcFailExhaustedCampaignQueueContacts: (...args: unknown[]) =>
    mocks.rpcFailExhaustedCampaignQueueContacts(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({ tenant: true })),
}));
vi.mock("@/lib/campaign-sms-send.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-sms-send.server")>()),
  sendSingleCampaignSms: (...args: unknown[]) => mocks.sendSingleCampaignSms(...args),
  hasDuplicateCampaignSms: (...args: unknown[]) => mocks.hasDuplicateCampaignSms(...args),
  OPTED_OUT_SMS_DEQUEUED_REASON: "Contact opted out",
  LANDLINE_SMS_DEQUEUED_REASON: "Landline — cannot receive SMS",
  DUPLICATE_SMS_DEQUEUED_REASON: "Duplicate SMS prevented",
}));

import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";
import { QUERY_POOL_MAX } from "@/server/db-pool-size";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";

function queueRow(id: number, contactId: number) {
  return {
    id,
    contact_id: contactId,
    contact: { id: contactId, phone: `+155511100${contactId}`, firstname: `Contact ${contactId}`, opt_out: false },
  };
}

/**
 * The real driver of a batch: `getOrLookupLineType` is the first `await` on
 * every row, so it is where pre-provider work accumulates. Delaying it
 * reproduces a slow DB or a contended event loop without mocking the
 * provider call itself.
 */
function delayLineTypeLookup(contactId: number, delayMs: number) {
  mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
    if (args.contactId === contactId) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  });
}

/**
 * The smallest interval between any two provider requests, in request order.
 * A rate limit is a statement about every adjacent pair, not just the first,
 * so this sorts before differencing — otherwise a pair that arrives out of
 * dispatch order is measured as a negative or inflated gap.
 */
function minGapMs(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((at, i) => at - (sorted[i] ?? at));
  return gaps.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...gaps);
}

describe("campaign SMS dispatch pacing", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // Legacy defaults: one row per claim batch, 1 MPS. `clearAllMocks` wipes
    // implementations, so both are re-armed here for every test.
    mocks.configuredDispatcherSmsMps.mockReturnValue(1);
    mocks.claimBatchSizeForRate.mockImplementation((rate: number) => Math.ceil(rate));
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      campaign: {
        id: 42,
        sms_send_mode: null,
        sms_send_window: null,
        caller_id: "+15550000000",
      },
      body_text: "Hello {{firstname}}",
      message_media: [],
    });
    mocks.getCampaignQueueById.mockResolvedValue([queueRow(701, 30), queueRow(702, 31)]);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      parallelDispatchEnabled: true,
      smsTargetMps: 1,
    });
    mocks.dequeueQueueEntry.mockResolvedValue(undefined);
    mocks.recordQueueAttemptFailure.mockResolvedValue(undefined);
    mocks.hasDuplicateCampaignSms.mockResolvedValue(false);
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.createSignedObjectUrl.mockResolvedValue("signed");
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(0);
    mocks.sendSingleCampaignSms.mockResolvedValue({
      message: { sid: "SM1" },
      persisted: true,
    });
  });

  test("keeps one-MPS spacing when each row starts a new claim batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T15:00:00.000Z"));
    const sendTimes: number[] = [];
    mocks.sendSingleCampaignSms.mockImplementation(async () => {
      sendTimes.push(Date.now());
      return { message: { sid: `SM${sendTimes.length}` }, persisted: true };
    });

    const running = dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await running;

    expect(sendTimes).toHaveLength(2);
    expect(sendTimes[1] - sendTimes[0]).toBeGreaterThanOrEqual(1_000);
  });
});

/**
 * The rate limit that matters is the one Twilio enforces: gaps between
 * *provider requests*. `lastStartAt` is stamped when a row is dispatched, and
 * a dispatched row then does async work (line-type lookup, duplicate check)
 * before the request is issued, so the dispatch clock and the provider clock
 * drift apart by exactly that pre-request work.
 *
 * With a concurrent batch the drift is per-row, and it can cancel out the
 * pacing wait: row n's slow lookup makes the next row's dispatch look like the
 * interval has already elapsed, so `waitMs` computes to 0 and the provider
 * request goes out immediately. Pacing silently stops under load — precisely
 * when it is needed.
 *
 * Fake timers keep this deterministic: no CPU contention, no jitter, and
 * `Date.now()` advances only with the scheduled waits, so a correct gap is the
 * full interval.
 */
describe("campaign SMS dispatch pacing — the clock the provider sees", () => {
  const RATE_MPS = 50; // 20ms nominal
  const INTERVAL_MS = 1_000 / RATE_MPS;
  /**
   * Between 0 and 2x the interval, so it shifts a row's request inside its
   * neighbour's slot rather than a slot later. 35ms against a 20ms interval
   * moves a dispatched-at-0 row's request to 35ms, past the instant row
   * dispatched at 20ms — the two land 15ms apart where 20ms is required.
   */
  const SLOW_LOOKUP_MS = 35;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.configuredDispatcherSmsMps.mockReturnValue(RATE_MPS);
    // One claim batch holds every row, so all of them are dispatched together
    // and their pre-request work overlaps — the shape under test.
    mocks.claimBatchSizeForRate.mockReturnValue(25);
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      campaign: { id: 42, sms_send_mode: null, sms_send_window: null, caller_id: "+15550000000" },
      body_text: "Hello {{firstname}}",
      message_media: [],
    });
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      parallelDispatchEnabled: true,
      smsTargetMps: RATE_MPS,
    });
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30),
      queueRow(702, 31),
      queueRow(703, 32),
    ]);
    mocks.dequeueQueueEntry.mockResolvedValue(undefined);
    mocks.recordQueueAttemptFailure.mockResolvedValue(undefined);
    mocks.hasDuplicateCampaignSms.mockResolvedValue(false);
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.createSignedObjectUrl.mockResolvedValue("signed");
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(0);
  });

  test("a slow pre-request lookup on one row does not let the next provider request overtake it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T15:00:00.000Z"));
    const sendTimes: number[] = [];
    mocks.sendSingleCampaignSms.mockImplementation(async () => {
      sendTimes.push(Date.now());
      return { message: { sid: `SM${sendTimes.length}` }, persisted: true };
    });
    // Row 30 is slow; row 31 is instant. If the pacing clock is stamped at
    // dispatch, row 31's request lands ~80ms after row 30's dispatch, which the
    // 20ms pacing check reads as "interval already elapsed" and skips.
    delayLineTypeLookup(30, SLOW_LOOKUP_MS);

    const running = dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await running;

    expect(sendTimes).toHaveLength(3);
    expect(minGapMs(sendTimes)).toBeGreaterThanOrEqual(INTERVAL_MS);
  });

  test("the pacing wait is measured from the previous provider request, not the previous dispatch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T15:00:00.000Z"));
    const sendTimes: number[] = [];
    mocks.sendSingleCampaignSms.mockImplementation(async () => {
      sendTimes.push(Date.now());
      return { message: { sid: `SM${sendTimes.length}` }, persisted: true };
    });
    delayLineTypeLookup(30, SLOW_LOOKUP_MS);

    const running = dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await running;

    // Spelled out separately from the aggregate above so the failure names the
    // concrete pair. Row 30 is dispatched first but its request is issued
    // ~35ms in, after row 31 (dispatched at 20ms, instant) has already gone
    // out. Pacing the provider means the instant row waits for the slow row's
    // request, so the two land a full interval apart. A dispatch-stamped clock
    // instead emits them 15ms apart.
    const [first, second] = [...sendTimes].sort((a, b) => a - b);
    expect(second).toBeDefined();
    expect((second ?? 0) - (first ?? 0)).toBeGreaterThanOrEqual(INTERVAL_MS);
  });
});

/**
 * #2185: a batch claims up to 25 rows and prepares them at once, and every
 * preparation step is a database round trip. Without a bound, a 25-row batch
 * queues a 10-connection pool to capacity — and one pool serves the web app,
 * the admin client, every tenant client and the worker, so the whole process
 * waits, `/readyz` included.
 *
 * The bound must not collapse to 1: serialising preparation is the old
 * behaviour and it is slow. Asserted on both sides so neither degenerate fix
 * passes.
 */
describe("campaign SMS dispatch — preparation concurrency stays inside the pool", () => {
  const BATCH_ROWS = 25;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.configuredDispatcherSmsMps.mockReturnValue(20);
    mocks.claimBatchSizeForRate.mockReturnValue(25);
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 10_000 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      campaign: { id: 42, sms_send_mode: null, sms_send_window: null, caller_id: "+15550000000" },
      body_text: "Hello {{firstname}}",
      message_media: [],
    });
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      parallelDispatchEnabled: true,
      smsTargetMps: 20,
    });
    mocks.getCampaignQueueById.mockResolvedValue(
      Array.from({ length: BATCH_ROWS }, (_, i) => queueRow(700 + i, 30 + i)),
    );
    mocks.dequeueQueueEntry.mockResolvedValue(undefined);
    mocks.recordQueueAttemptFailure.mockResolvedValue(undefined);
    mocks.createSignedObjectUrl.mockResolvedValue("signed");
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(0);
    mocks.sendSingleCampaignSms.mockResolvedValue({ message: { sid: "SM" }, persisted: true });
  });

  /** Counts how many preparation round trips are open at once. */
  function trackPrepConcurrency() {
    let inFlight = 0;
    let peak = 0;
    const step = async <T>(value: T): Promise<T> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return value;
    };
    return {
      step,
      read: () => peak,
      // Half the pool: the bound the module derives from QUERY_POOL_MAX.
      bound: Math.ceil(QUERY_POOL_MAX / 2),
    };
  }

  test("does not open more preparation round trips than the pool can serve", async () => {
    const prep = trackPrepConcurrency();
    mocks.getOrLookupLineType.mockImplementation(() => prep.step(null));
    mocks.hasDuplicateCampaignSms.mockImplementation(() => prep.step(false));

    await dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });

    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledTimes(BATCH_ROWS);
    expect(prep.read()).toBeLessThanOrEqual(prep.bound);
  });

  test("still prepares rows in parallel rather than one at a time", async () => {
    // Guards against over-correcting. A bound of 1 would satisfy the test
    // above while reinstating the serialised dispatch the pacing fix removed.
    const prep = trackPrepConcurrency();
    mocks.getOrLookupLineType.mockImplementation(() => prep.step(null));
    mocks.hasDuplicateCampaignSms.mockImplementation(() => prep.step(false));

    await dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });

    expect(prep.read()).toBeGreaterThan(1);
  });
});
