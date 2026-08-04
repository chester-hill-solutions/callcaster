import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  env: { BASE_URL: () => "https://base.example" },
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  adminDb: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  db: {
    execute: vi.fn(),
  },
  validateTwilioWebhookParams: vi.fn(),
  loadWorkspaceTwilioCredentialsForAcd: vi.fn(),
  rpcClaimInboundQueueEntry: vi.fn(),
  rpcResetStaleInboundOffers: vi.fn(),
  rpcCompleteInboundQueueEntry: vi.fn(),
  rpcAbandonInboundQueueEntry: vi.fn(),
  hangupTwiml: vi.fn(() => "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>"),
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/twilio-twiml.server", () => ({ hangupTwiml: mocks.hangupTwiml }));

vi.mock("@/lib/twilio-workspace-credentials", () => ({
  readTwilioWorkspaceCredentials: vi.fn((data: unknown) => data),
  resolveTwilioWebhookAuthToken: vi.fn((creds: { authToken?: string } | null) =>
    creds?.authToken ?? null,
  ),
}));

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...args: unknown[]) =>
    mocks.validateTwilioWebhookParams(...args),
  shouldValidateTwilioWebhooks: vi.fn(() => true),
}));

vi.mock("@/server/admin-db", () => ({ adminDb: mocks.adminDb }));
vi.mock("@/server/db", () => ({ db: mocks.db }));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcClaimInboundQueueEntry: (...args: unknown[]) =>
    mocks.rpcClaimInboundQueueEntry(...args),
  rpcResetStaleInboundOffers: (...args: unknown[]) =>
    mocks.rpcResetStaleInboundOffers(...args),
  rpcAcceptInboundOffer: vi.fn(),
  rpcAbandonInboundQueueEntry: (...args: unknown[]) =>
    mocks.rpcAbandonInboundQueueEntry(...args),
  rpcCompleteInboundQueueEntry: (...args: unknown[]) =>
    mocks.rpcCompleteInboundQueueEntry(...args),
  rpcReleaseInboundOffer: vi.fn(),
}));

function makeAcdRequest(
  search: Record<string, string>,
  body: Record<string, string>,
) {
  const params = new URLSearchParams(search);
  return new Request(`https://base.example/api/acd-router?${params.toString()}`, {
    method: "POST",
    headers: { "x-twilio-signature": "sig" },
    body: new URLSearchParams(body),
  });
}

function mockQueueLookup() {
  mocks.adminDb.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () =>
          Promise.resolve([
            {
              id: 1,
              workspace_id: "w1",
              name: "Inbound Queue",
              hold_audio: null,
              twilio_data: { sid: "ACxxx", authToken: "token" },
            },
          ]),
      }),
    }),
  }));
}

describe("app/lib/acd/acd-router.server handleWaitUrl", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.adminDb.select.mockReset();
    mocks.adminDb.execute.mockReset();
    mocks.db.execute.mockReset();
    mocks.validateTwilioWebhookParams.mockReset().mockReturnValue(true);
    mocks.loadWorkspaceTwilioCredentialsForAcd.mockReset().mockResolvedValue({
      accountSid: "ACxxx",
      authToken: "token",
    });
    mocks.rpcClaimInboundQueueEntry.mockReset().mockResolvedValue(null);
    mocks.rpcResetStaleInboundOffers.mockReset().mockResolvedValue(0);
    mocks.hangupTwiml.mockClear();
  });

  /**
   * claim_inbound_queue_entry marks the chosen agent `busy`, and only the
   * Twilio status callback releases them. A lost callback would otherwise
   * remove that agent from inbound routing permanently, so stale offers are
   * swept before every claim.
   */
  test("sweeps stale offers before claiming an agent", async () => {
    const { claimAgentForQueue } = await import("@/lib/acd/acd-router.server");

    await claimAgentForQueue({
      queueId: 1,
      workspaceId: "w1",
      callSid: "CA1",
      callerNumber: "+15551234567",
    });

    expect(mocks.rpcResetStaleInboundOffers).toHaveBeenCalledTimes(1);
    expect(mocks.rpcClaimInboundQueueEntry).toHaveBeenCalledTimes(1);
  });

  test("a failing sweep still lets the caller be routed", async () => {
    mocks.rpcResetStaleInboundOffers.mockRejectedValueOnce(new Error("db blip"));
    const { claimAgentForQueue } = await import("@/lib/acd/acd-router.server");

    await expect(
      claimAgentForQueue({
        queueId: 1,
        workspaceId: "w1",
        callSid: "CA1",
        callerNumber: "+15551234567",
      }),
    ).resolves.toBeNull();
    expect(mocks.rpcClaimInboundQueueEntry).toHaveBeenCalledTimes(1);
  });

  test("does not create a new offer when an active entry already exists for the call", async () => {
    mockQueueLookup();
    mocks.adminDb.execute.mockResolvedValueOnce([
      {
        id: 42,
        queue_id: 1,
        workspace_id: "w1",
        call_sid: "CA1",
        caller_number: "+15551234567",
        status: "offered",
        offered_to_user_id: "agent-1",
      },
    ]);
    const mod = await import("@/lib/acd/acd-router.server");

    const request = makeAcdRequest(
      { queue_id: "1" },
      { CallSid: "CA1", From: "+15551234567", QueueTime: "0" },
    );
    const res = await asRouteResponse(mod.handleAcdRouterRequest(request, "wait"),
    );
    expect(await res.text()).toContain("queue");
    expect(mocks.rpcClaimInboundQueueEntry).not.toHaveBeenCalled();
  });

  test("returns hangup when maximum queue time is exceeded", async () => {
    mockQueueLookup();
    const mod = await import("@/lib/acd/acd-router.server");

    const request = makeAcdRequest(
      { queue_id: "1" },
      { CallSid: "CA1", From: "+15551234567", QueueTime: String(mod.MAX_QUEUE_TIME_SECONDS + 1) },
    );
    const res = await asRouteResponse(mod.handleAcdRouterRequest(request, "wait"),
    );
    expect(await res.text()).toContain("Hangup");
    expect(mocks.rpcClaimInboundQueueEntry).not.toHaveBeenCalled();
  });

  test("returns hangup when maximum offer attempts are reached", async () => {
    mockQueueLookup();
    const mod = await import("@/lib/acd/acd-router.server");
    mocks.adminDb.execute
      .mockResolvedValueOnce([]) // findExistingInboundQueueEntry: no existing entry
      .mockResolvedValueOnce([{ count: mod.MAX_OFFER_ATTEMPTS }]); // countInboundQueueOfferAttempts

    const request = makeAcdRequest(
      { queue_id: "1" },
      { CallSid: "CA1", From: "+15551234567", QueueTime: "0" },
    );
    const res = await asRouteResponse(mod.handleAcdRouterRequest(request, "wait"),
    );
    expect(await res.text()).toContain("Hangup");
    expect(mocks.rpcClaimInboundQueueEntry).not.toHaveBeenCalled();
  });

  test("claims a new agent when no active entry exists and limits are not exceeded", async () => {
    mockQueueLookup();
    const mod = await import("@/lib/acd/acd-router.server");
    mocks.adminDb.execute
      .mockResolvedValueOnce([]) // findExistingInboundQueueEntry: no existing entry
      .mockResolvedValueOnce([{ count: 0 }]); // countInboundQueueOfferAttempts: 0
    mocks.rpcClaimInboundQueueEntry.mockResolvedValue({
      agent_user_id: "agent-1",
      entry_id: 123,
    });

    const request = makeAcdRequest(
      { queue_id: "1" },
      { CallSid: "CA1", From: "+15551234567", QueueTime: "0" },
    );
    const res = await asRouteResponse(mod.handleAcdRouterRequest(request, "wait"),
    );
    expect(await res.text()).toContain("queue");
    expect(mocks.rpcClaimInboundQueueEntry).toHaveBeenCalledOnce();
    expect(mocks.rpcClaimInboundQueueEntry).toHaveBeenCalledWith(
      expect.anything(),
      {
        queueId: 1,
        workspaceId: "w1",
        callSid: "CA1",
        callerNumber: "+15551234567",
      },
    );
  });
});

describe("app/lib/acd/acd-router.server handleComplete", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.adminDb.select.mockReset();
    mocks.adminDb.execute.mockReset();
    mocks.validateTwilioWebhookParams.mockReset().mockReturnValue(true);
    mocks.rpcCompleteInboundQueueEntry.mockReset();
    mocks.rpcAbandonInboundQueueEntry.mockReset();
  });

  function makeCompleteRequest(
    search: Record<string, string>,
    body: Record<string, string>,
  ) {
    const params = new URLSearchParams(search);
    return new Request(
      `https://base.example/api/acd-router/complete?${params.toString()}`,
      {
        method: "POST",
        headers: { "x-twilio-signature": "sig" },
        body: new URLSearchParams(body),
      },
    );
  }

  test("resolves the entry by CallSid + queue_name and completes it on bridged", async () => {
    mockQueueLookup();
    mocks.adminDb.execute.mockResolvedValueOnce([
      {
        id: 42,
        queue_id: 1,
        workspace_id: "w1",
        call_sid: "CA1",
        caller_number: "+15551234567",
        status: "claimed",
        offered_to_user_id: "agent-1",
      },
    ]);
    const mod = await import("@/lib/acd/acd-router.server");

    const request = makeCompleteRequest(
      { queue_name: "inbound_q_1" },
      { CallSid: "CA1", QueueResult: "bridged" },
    );
    const res = await asRouteResponse(
      mod.handleAcdRouterRequest(request, "complete"),
    );
    expect(res.status).toBe(200);
    expect(mocks.rpcCompleteInboundQueueEntry).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(mocks.rpcAbandonInboundQueueEntry).not.toHaveBeenCalled();
  });

  test("abandons the resolved entry on hangup", async () => {
    mockQueueLookup();
    mocks.adminDb.execute.mockResolvedValueOnce([
      {
        id: 43,
        queue_id: 1,
        workspace_id: "w1",
        call_sid: "CA2",
        caller_number: "+15551234567",
        status: "waiting",
        offered_to_user_id: null,
      },
    ]);
    const mod = await import("@/lib/acd/acd-router.server");

    const request = makeCompleteRequest(
      { queue_name: "inbound_q_1" },
      { CallSid: "CA2", QueueResult: "hangup" },
    );
    const res = await asRouteResponse(
      mod.handleAcdRouterRequest(request, "complete"),
    );
    expect(res.status).toBe(200);
    expect(mocks.rpcAbandonInboundQueueEntry).toHaveBeenCalledWith(
      expect.anything(),
      43,
    );
  });

  test("fails closed with 403 when no workspace can be resolved", async () => {
    mocks.adminDb.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }));
    const mod = await import("@/lib/acd/acd-router.server");

    const request = makeCompleteRequest(
      { queue_name: "inbound_q_999" },
      { CallSid: "CA3", QueueResult: "bridged" },
    );
    const res = await asRouteResponse(
      mod.handleAcdRouterRequest(request, "complete"),
    );
    expect(res.status).toBe(403);
    expect(mocks.rpcCompleteInboundQueueEntry).not.toHaveBeenCalled();
  });
});
