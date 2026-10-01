import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * A workspace-scoped compliance failure must not be charged to the audience
 * (#2081).
 *
 * The defect: `assertWorkspaceCanSendSms` was the first statement of
 * `sendSingleCampaignSms`, so it ran once per CONTACT. It throws a
 * workspace-scoped error — A2P not approved, sender pool out of sync,
 * toll-free unverified — and nothing caught that class, so the per-member
 * rejection handler treated it as a per-recipient send failure and recorded an
 * attempt against the row. The same tick runs the dead-letter sweep at
 * `max_attempts = 5`, so five ticks of a non-ready workspace flipped the WHOLE
 * audience to `failed` with "Max queue attempts exceeded". Nothing had been
 * sent and no contact was ever at fault.
 *
 * The fix checks the gate once per dispatch, before any row is selected, and
 * defers. The assertions below are all kill-checks: each one fails if the gate
 * moves back to the per-contact path, or if anything records a row failure.
 */

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(async () => undefined),
  recordQueueAttemptFailure: vi.fn(async () => undefined),
  dequeueQueueEntry: vi.fn(async () => ({ dequeuedPrimary: true })),
  rpcFailExhausted: vi.fn(async () => 0),
  twilioMessagesCreate: vi.fn(),
  createMessageIntent: vi.fn(async () => "intent-1"),
  members: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/twilio-readiness.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-readiness.server")>()),
  assertWorkspaceCanSendSms: (...args: unknown[]) => mocks.readiness(...args),
}));

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
  recordQueueAttemptFailure: (...args: unknown[]) =>
    mocks.recordQueueAttemptFailure(...args),
}));

vi.mock("@/lib/sms-campaign-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-campaign-db.server")>()),
  loadCampaignSmsDispatchData: async () => ({
    campaign: {
      campaign: {
        id: 10,
        type: "message",
        // `messaging_service` so the caller-id gate does not short-circuit to
        // `caller_id_required` before any compliance check runs — the point of
        // these tests is the readiness gate, reached by every real campaign.
        caller_id: "+15550001111",
        sms_send_mode: "messaging_service",
        sms_send_window: null,
        sms_messaging_service_sid: "MG123",
      },
    },
    message_media: [],
  }),
}));

vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  updateOutreachAttemptForWorkspace: async () => new Response(null, { status: 200 }),
}));

// The batch's collaborators that would otherwise reach the database. The gate
// is the only thing under test, so every other seam is stubbed to a pass.
vi.mock("@/lib/database/campaign.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign.server")>()),
  getCampaignQueueById: async () => mocks.members,
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspaceTwilioPortalConfig: async () => ({
    parallelDispatchEnabled: false,
    sendingMode: "standard",
  }),
  createWorkspaceTwilioInstance: () => ({ messages: { create: mocks.twilioMessagesCreate } }),
}));

vi.mock("@/lib/workspace-credits.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-credits.server")>()),
  getWorkspaceCreditsBalance: async () => 1000,
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcCreateOutreachAttempt: async () => 1,
  rpcTryCompleteCampaignIfDrained: async () => undefined,
  rpcFailExhaustedCampaignQueueContacts: (...args: unknown[]) =>
    mocks.rpcFailExhausted(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({}),
  withAppCurrentUser: async (_u: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/lib/twilio-lookup.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-lookup.server")>()),
  getOrLookupLineType: async () => "mobile",
  isSmsIncapableLineType: () => false,
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { WorkspaceSmsNotReadyError } = await import(
  "@/lib/twilio-readiness.server"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readiness.mockResolvedValue(undefined);
  mocks.members = [
    {
      id: 1,
      contact_id: 101,
      campaign_id: 10,
      workspace: "w1",
      queue_state: "queued",
      claimed_at: null,
      contact: { phone: "+15551230001" },
    },
    {
      id: 2,
      contact_id: 102,
      campaign_id: 10,
      workspace: "w1",
      queue_state: "queued",
      claimed_at: null,
      contact: { phone: "+15551230002" },
    },
    {
      id: 3,
      contact_id: 103,
      campaign_id: 10,
      workspace: "w1",
      queue_state: "queued",
      claimed_at: null,
      contact: { phone: "+15551230003" },
    },
  ];
});

async function dispatch() {
  const { dispatchCampaignSmsBatch } = await import(
    "@/lib/campaign-sms-dispatch.server"
  );
  return dispatchCampaignSmsBatch({
    workspaceId: "w1",
    campaignId: "10",
    // Passed explicitly so the caller-id gate cannot short-circuit to
    // `caller_id_required` before the readiness gate — the one under test — is
    // ever reached.
    callerId: "+15550001111",
    maxContacts: 25,
  } as never);
}

describe("workspace compliance failure must not charge the audience (#2081)", () => {
  test("a non-ready workspace defers the whole batch", async () => {
    mocks.readiness.mockRejectedValue(
      new WorkspaceSmsNotReadyError([
        "A2P 10DLC registration is not approved yet.",
        "Sender pool is out of sync with Twilio.",
      ]),
    );

    const outcome = await dispatch();

    expect(outcome.kind).toBe("deferred");
  });

  // The core kill-check. Before the fix this was called once per queued row on
  // every tick, and five ticks dead-lettered the entire audience.
  test("records NO per-row attempt failure", async () => {
    mocks.readiness.mockRejectedValue(
      new WorkspaceSmsNotReadyError(["A2P 10DLC registration is not approved yet."]),
    );

    await dispatch();

    expect(mocks.recordQueueAttemptFailure).not.toHaveBeenCalled();
  });

  test("dequeues nothing, so re-approving compliance brings the audience back", async () => {
    mocks.readiness.mockRejectedValue(
      new WorkspaceSmsNotReadyError(["A2P 10DLC registration is not approved yet."]),
    );

    await dispatch();

    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
  });

  // The dead-letter sweep is what turned five ticks of this into a burned
  // audience. It must not run when the gate is what stopped the batch.
  test("does not run the exhaustion sweep", async () => {
    mocks.readiness.mockRejectedValue(
      new WorkspaceSmsNotReadyError(["A2P 10DLC registration is not approved yet."]),
    );

    await dispatch();

    expect(mocks.rpcFailExhausted).not.toHaveBeenCalled();
  });

  // The operator has to learn the real cause. This used to surface as
  // "Max queue attempts exceeded" on every contact.
  test("carries the real reasons, not a generic message", async () => {
    const reasons = [
      "A2P 10DLC registration is not approved yet.",
      "Sender pool is out of sync with Twilio.",
    ];
    mocks.readiness.mockRejectedValue(new WorkspaceSmsNotReadyError(reasons));

    const outcome = await dispatch();

    expect(outcome.kind === "deferred" && outcome.because === "workspace_not_ready" && outcome.reasons).toEqual(
      reasons,
    );
  });

  test("the whole audience is still counted as queued", async () => {
    mocks.readiness.mockRejectedValue(
      new WorkspaceSmsNotReadyError(["A2P 10DLC registration is not approved yet."]),
    );

    const outcome = await dispatch();

    expect(
      outcome.kind === "deferred" && outcome.progress.queuedRemaining,
    ).toBe(3);
  });

  // A gate that is not ready is the only thing that should defer. An unrelated
  // failure must still surface, or the batch would silently swallow real bugs.
  test("an unrelated readiness error is not swallowed as a deferral", async () => {
    mocks.readiness.mockRejectedValue(new Error("database connection refused"));

    await expect(dispatch()).rejects.toThrow("database connection refused");
  });

  test("a ready workspace dispatches normally", async () => {
    mocks.readiness.mockResolvedValue(undefined);
    const outcome = await dispatch();

    expect(outcome.kind).not.toBe("deferred");
  });
});
