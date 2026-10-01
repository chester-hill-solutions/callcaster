import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2187: the send path has per-row failure handling — `sendSingleCampaignSms`
 * rejects, and its `.then(_, onError)` releases the credit, counts the failure,
 * records the attempt and returns a result for that contact alone. Preparation
 * had none of it.
 *
 * `prepareClaimedMember` does four database round trips (line-type lookup,
 * possibly two dequeues, duplicate check) plus a reservation. Any of them
 * throwing propagated out of `handleMember` into `await Promise.all(...)` in
 * `runPacedSendBatches`, and `Promise.all` rejects on the first rejection. One
 * bad contact therefore:
 *
 *   - discarded the responses of its batch siblings, which had already sent;
 *   - abandoned every remaining batch in the campaign;
 *   - skipped `rpcFailExhaustedCampaignQueueContacts`, so the failed row never
 *     dead-lettered and the campaign could not drain.
 *
 * A second, narrower leak: the reservation is made at the end of preparation,
 * and the only code that gives it back lives in the send's rejection handler.
 * A throw in the window after `reserve` — a synchronous throw from
 * `sendSingleCampaignSms` itself, for instance — kept the credits for the rest
 * of the dispatch.
 */
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
// #2081: the workspace readiness gate moved to the batch level, so it now runs
// in every dispatch. These suites cover pacing, window gating and row
// failures with a ready workspace; the not-ready path has its own test.
vi.mock("@/lib/twilio-readiness.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-readiness.server")>()),
  assertWorkspaceCanSendSms: async () => undefined,
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
import { estimateMessageCredits } from "../shared/pricing";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000002";

type RowResult = { success: boolean; error?: string; skipped?: boolean; reason?: string };

function queueRow(id: number, contactId: number, overrides: Record<string, unknown> = {}) {
  const { contact: contactOverride, ...rest } = overrides;
  return {
    id,
    contact_id: contactId,
    contact: {
      id: contactId,
      phone: `+155511100${contactId}`,
      firstname: `Contact ${contactId}`,
      opt_out: false,
      ...((contactOverride as Record<string, unknown>) ?? {}),
    },
    ...rest,
  };
}

function dispatch() {
  return dispatchCampaignSmsBatch({ workspaceId: WORKSPACE_ID, campaignId: "42", userId: USER_ID });
}

type DispatchResult = Awaited<ReturnType<typeof dispatch>>;

/**
 * `dispatched` returns `counts` flat; `deferred` nests them under
 * `progress`. Read them the same way whatever came back.
 */
function countsOf(result: DispatchResult) {
  return result.kind === "dispatched" ? result.counts : result.progress.counts;
}

/** Every contact's outcome, flattened from the array of per-contact records. */
function outcomes(responses: ReadonlyArray<Record<string, RowResult>>): Map<string, RowResult> {
  const map = new Map<string, RowResult>();
  for (const entry of responses) {
    for (const [contactId, result] of Object.entries(entry)) map.set(contactId, result);
  }
  return map;
}

describe("campaign SMS dispatch — one row's failure (#2187)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configuredDispatcherSmsMps.mockReturnValue(50);
    mocks.claimBatchSizeForRate.mockReturnValue(25);
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      campaign: { id: 42, sms_send_mode: null, sms_send_window: null, caller_id: "+15550000000" },
      body_text: "Hello {{firstname}}",
      message_media: [],
    });
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      parallelDispatchEnabled: true,
      smsTargetMps: 50,
    });
    mocks.dequeueQueueEntry.mockResolvedValue(undefined);
    mocks.recordQueueAttemptFailure.mockResolvedValue(undefined);
    mocks.hasDuplicateCampaignSms.mockResolvedValue(false);
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.createSignedObjectUrl.mockResolvedValue("signed");
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(0);
    mocks.sendSingleCampaignSms.mockResolvedValue({ message: { sid: "SM1" }, persisted: true });
  });

  test("a preparation failure does not abort its batch siblings", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30),
      queueRow(702, 31),
      queueRow(703, 32),
    ]);
    mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
      if (args.contactId === 31) throw new Error("line type lookup failed");
      return null;
    });

    const result = await dispatch();

    // The whole dispatch completes instead of throwing.
    expect(result.kind).toBe("dispatched");
    // Both healthy rows sent, even though they shared a batch with the failure.
    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledTimes(2);
    expect(countsOf(result).sent).toBe(2);
    expect(countsOf(result).failed).toBe(1);

    const byContact = outcomes(result.responses);
    expect(byContact.get("30")?.success).toBe(true);
    expect(byContact.get("32")?.success).toBe(true);
    expect(byContact.get("31")).toEqual({ success: false, error: "line type lookup failed" });
  });

  test("a failed row is dead-letter-eligible, so the campaign can drain", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([queueRow(701, 30), queueRow(702, 31)]);
    mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
      if (args.contactId === 31) throw new Error("line type lookup failed");
      return null;
    });

    await dispatch();

    // The attempt is recorded and the exhaust RPC runs. Before the fix the
    // throw skipped both, so the row stayed eligible and re-failed forever.
    expect(mocks.recordQueueAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: 702, error: "line type lookup failed" }),
    );
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).toHaveBeenCalled();
  });

  test("every contact in the queue gets exactly one outcome", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30),
      queueRow(702, 31),
      queueRow(703, 32),
    ]);
    mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
      if (args.contactId === 31) throw new Error("line type lookup failed");
      return null;
    });

    const result = await dispatch();

    // A row silently missing from `responses` is indistinguishable from a row
    // that was never attempted, so the map has to stay complete.
    expect([...outcomes(result.responses).keys()].sort()).toEqual(["30", "31", "32"]);
  });

  test("a failed dequeue on an opt-out row does not abort the batch", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30, { contact: { opt_out: true } }),
      queueRow(702, 31),
    ]);
    mocks.dequeueQueueEntry.mockImplementation(async (args: { by: { id: number } }) => {
      if (args.by.id === 701) throw new Error("dequeue failed");
      return undefined;
    });

    const result = await dispatch();

    // The opt-out dequeue happens in `handleMember`, before preparation is
    // reached, so it needs the same boundary as the preparation path.
    expect(result.kind).toBe("dispatched");
    expect(countsOf(result).sent).toBe(1);
    expect(outcomes(result.responses).get("31")?.success).toBe(true);
    expect(outcomes(result.responses).get("30")).toEqual({
      success: false,
      error: "dequeue failed",
    });
  });

  test("a failure to *record* a failure still costs one row, not the batch", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30),
      queueRow(702, 31),
      queueRow(703, 32),
    ]);
    mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
      if (args.contactId === 31) throw new Error("line type lookup failed");
      return null;
    });
    // The write that records a failure is itself a database write, against the
    // same database that is already failing. When it rejects, `failRow` throws
    // and the rejection escapes the row boundary — which is exactly why the
    // batch loop settles rows individually instead of with `Promise.all`.
    mocks.recordQueueAttemptFailure.mockRejectedValue(new Error("recorder down"));

    const result = await dispatch();

    expect(result.kind).toBe("dispatched");
    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledTimes(2);
    expect(countsOf(result).sent).toBe(2);
    // Still counted and still reported, so the caller is not left thinking the
    // row was never attempted. The row stays queued: with no recorded attempt
    // there is nothing to dead-letter it on.
    expect(countsOf(result).failed).toBe(1);
    expect([...outcomes(result.responses).keys()].sort()).toEqual(["30", "31", "32"]);
  });

  test("a credit reserved before a failure is released for the next row", async () => {
    // Exactly one row's worth of credits, so the second row is affordable only
    // if the first row's reservation is given back. The figure comes from the
    // real estimator because a pricing change must not silently turn this into
    // a test of the wrong thing; what is asserted is the outcome, not the cost.
    const rowCost = estimateMessageCredits({ body: "Hello Contact 30", hasMedia: false }).credits;
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: rowCost });
    mocks.getCampaignQueueById.mockResolvedValue([queueRow(701, 30), queueRow(702, 31)]);

    // Row 30 reserves, then throws out of `sendSingleCampaignSms` itself — a
    // synchronous throw, which the send's own rejection handler cannot see.
    let releaseGate: () => void = () => {};
    const threw = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mocks.sendSingleCampaignSms.mockImplementation((args: { contact_id: number }) => {
      if (args.contact_id !== 30) {
        return Promise.resolve({ message: { sid: "SM31" }, persisted: true });
      }
      releaseGate();
      throw new Error("send setup failed");
    });
    // Hold row 31's first database round trip until row 30 has failed, so the
    // reservation order is deterministic rather than a race.
    mocks.getOrLookupLineType.mockImplementation(async (args: { contactId: number }) => {
      if (args.contactId === 31) await threw;
      return null;
    });

    const result = await dispatch();

    expect(countsOf(result).unaffordable).toBe(0);
    expect(countsOf(result).sent).toBe(1);
    expect(outcomes(result.responses).get("31")?.success).toBe(true);
    expect(outcomes(result.responses).get("30")).toEqual({
      success: false,
      error: "send setup failed",
    });
  });
});
