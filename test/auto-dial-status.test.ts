import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  makeApplyLedgerEntryRpcStub,
  makeTransactionHistoryTableStub,
  type TransactionRow,
} from "./helpers/transaction-history-stub";
import { telephonyStubState, configureTelephonyStub, telephonyDbMocks } from "./helpers/telephony-db-stub";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}));
const campaignQueueDbMocks = vi.hoisted(() => ({
  updateCampaignQueueByContactAndCampaign: vi.fn(async () => []),
  updateError: null as Error | null,
}));
vi.mock("@/lib/logger.server", () => ({
  logger: loggerMocks,
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  updateCampaignQueueByContactAndCampaign: async (...args: unknown[]) => {
    if (campaignQueueDbMocks.updateError) {
      throw campaignQueueDbMocks.updateError;
    }
    return campaignQueueDbMocks.updateCampaignQueueByContactAndCampaign(...args);
  },
}));

const twilioValidation = vi.hoisted(() => ({
  validateTwilioWebhookParams: vi.fn(() => true),
  requireTwilioSignature: vi.fn(),
}));
const rpcDequeueContactMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    twilioValidation.requireTwilioSignature(...args),
}));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: twilioValidation.validateTwilioWebhookParams,
}));

vi.mock("@/lib/telephony-db.server", async () => {
  const stub = await import("./helpers/telephony-db-stub");
  return {
    findCallBySid: stub.telephonyDbMocks.findCallBySid,
    findCallsByConferenceId: stub.telephonyDbMocks.findCallsByConferenceId,
    findActiveConferenceIdsForUser: stub.telephonyDbMocks.findActiveConferenceIdsForUser,
    updateCallBySid: stub.telephonyDbMocks.updateCallBySid,
    findOutreachAttemptById: stub.telephonyDbMocks.findOutreachAttemptById,
    updateOutreachAttemptForWorkspace: stub.telephonyDbMocks.updateOutreachAttemptForWorkspace,
    insertCallForWorkspace: stub.telephonyDbMocks.insertCallForWorkspace,
    findCampaignTypeByCampaignId: stub.telephonyDbMocks.findCampaignTypeByCampaignId,
    upsertCallBySid: stub.telephonyDbMocks.upsertCallBySid,
    claimTerminalCallStatus: stub.telephonyDbMocks.claimTerminalCallStatus,
  };
});

vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: rpcDequeueContactMock,
}));

const runAutoDialerTurnMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auto-dial.server", () => ({
  runAutoDialerTurn: (...args: unknown[]) => runAutoDialerTurnMock(...args),
}));

const emitPredictiveBroadcastMock = vi.hoisted(() => vi.fn(async () => null));
// Several modules in this route's graph (twilio-call-status, campaign-queue-db,
// transaction-history, …) also import from workspace-events.server, so keep
// every other export intact and stub only what this suite asserts on.
vi.mock("@/lib/workspace-events.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/workspace-events.server")
  >();
  return {
    ...actual,
    emitPredictiveBroadcast: (...args: unknown[]) =>
      emitPredictiveBroadcastMock(...(args as [unknown, unknown])),
  };
});

const twilioClientMock = {
  conferences: Object.assign(
    (sid: string) => ({
      update: vi.fn(async () => ({ sid, status: "completed" })),
    }),
    {
      list: vi.fn(async () => [] as Array<{ sid: string }>),
    },
  ),
};

vi.mock("../app/lib/database/workspace.server", async () => {
  const actual = await vi.importActual<
    typeof import("../app/lib/database/workspace.server")
  >("../app/lib/database/workspace.server");
  return {
    ...actual,
    createWorkspaceTwilioInstance: vi.fn(async () => twilioClientMock as any),
  };
});

function makeDbClientStub(args?: { outreachDisposition?: string }) {
  const transactionRows: TransactionRow[] = [];
  const outreachUpdateCalls: any[] = [];
  let lastCallSid: string = "CA1";

  const callSelectError: Error | null = (args as any)?.callSelectError ?? null;
  const callUpdateError: Error | null = (args as any)?.callUpdateError ?? null;
  const workspaceAuthToken: string | null | undefined = (args as any)?.workspaceAuthToken;
  const outreachUpdateError: Error | null = (args as any)?.outreachUpdateError ?? null;
  const outreachUpdateThrows: unknown = (args as any)?.outreachUpdateThrows ?? null;
  const campaignQueueUpdateError: Error | null = (args as any)?.campaignQueueUpdateError ?? null;
  campaignQueueDbMocks.updateError = campaignQueueUpdateError;
  campaignQueueDbMocks.updateCampaignQueueByContactAndCampaign.mockClear();
  const rpcDequeueError: Error | null = (args as any)?.rpcDequeueError ?? null;
  const outreachFetchError: Error | null = (args as any)?.outreachFetchError ?? null;

  const dbCallRow =
    (args as any)?.dbCall ?? ({
      sid: "CA1",
      workspace: "w1",
      outreach_attempt_id: 1,
      conference_id: "conf1",
      contact_id: 1,
      campaign_id: 1,
    } as any);

  const from = (table: string) => {
    if (table === "call") {
      return {
        select: () => ({
          eq: (_col: string, sid: string) => {
            lastCallSid = String(sid);
            return {
              single: async () => ({
                data: callSelectError ? null : { ...dbCallRow, sid: lastCallSid },
                error: callSelectError,
              }),
            };
          },
        }),
        update: (_patch: any) => ({
          eq: (_col: string, sid: string) => {
            lastCallSid = String(sid);
            return {
              select: () => ({
                single: async () => ({
                  data: callUpdateError ? null : { ...dbCallRow, sid: lastCallSid },
                  error: callUpdateError,
                }),
              }),
            };
          },
        }),
      };
    }

    if (table === "workspace") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                workspaceAuthToken === null
                  ? ({} as any)
                  : {
                      twilio_data: {
                        sid: "AC_test",
                        authToken: workspaceAuthToken ?? "twilio-token",
                      },
                    },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "outreach_attempt") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                disposition: args?.outreachDisposition ?? "in-progress",
                contact_id: 1,
              },
              error: outreachFetchError,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                if (outreachUpdateThrows != null) throw outreachUpdateThrows;
                if (outreachUpdateError) return { data: null, error: outreachUpdateError };
                outreachUpdateCalls.push(patch);
                return { data: { ...patch, contact_id: 1 }, error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === "transaction_history") {
      return makeTransactionHistoryTableStub(transactionRows);
    }

    throw new Error(`unexpected table ${table}`);
  };

  return {
    from,
    rpc: vi.fn(async (fn: string, rpcArgs: any) => {
      if (fn === "apply_ledger_entry_and_sync_credits") {
        return makeApplyLedgerEntryRpcStub(transactionRows)(fn, rpcArgs);
      }
      return { data: null, error: rpcDequeueError };
    }),
    execute: vi.fn(async (query: any) => {
      const sqlText = typeof query === "string"
        ? query
        : typeof query?.toSQL === "function"
          ? JSON.stringify(query.toSQL())
          : JSON.stringify(query);
      if (sqlText.includes("apply_ledger_entry_and_sync_credits")) {
        const values = query?.queryChunks?.filter((_: unknown, i: number) => i % 2 === 1) ?? [];
        const [workspace, type, amount, idempotencyKey, note, campaignId, callSid, messageSid] = values;
        const result = await makeApplyLedgerEntryRpcStub(transactionRows)(
          "apply_ledger_entry_and_sync_credits",
          {
            p_workspace_id: workspace,
            p_type: type,
            p_amount: amount,
            p_idempotency_key: idempotencyKey,
            p_description: note,
            p_campaign_id: campaignId,
            p_call_sid: callSid,
            p_message_sid: messageSid,
          },
        );
        return result.data ? [result.data] : [];
      }
      return [];
    }),
    _transactionRows: transactionRows,
    _outreachUpdateCalls: outreachUpdateCalls,
    _telephonyConfig: {
      callRow: dbCallRow,
      callSelectError,
      callUpdateError,
      campaignType: args?.campaignType,
      outreachDisposition: args?.outreachDisposition,
      outreachAnsweredAt: (args as any)?.outreachAnsweredAt,
      outreachFetchError,
      outreachUpdateError,
      outreachUpdateThrows,
      rpcDequeueError,
    },
  };
}

let postgresStub: ReturnType<typeof makeDbClientStub>;
const clientState = vi.hoisted(() => ({ client: null as any }));

vi.mock("@/lib/auth.server", () => ({
  getAdminDb: () => clientState.client,
}));

// Deliberately NOT a catch-all Proxy. One here manufactured any property asked
// for, including a Supabase `.channel()` that does not exist on the real Drizzle
// client — which is how a route that 500'd on every callback passed CI. Reading
// a property the real adminDb does not have now throws instead.
vi.mock("@/server/admin-db", () => ({
  adminDb: new Proxy({} as any, {
    get(_target, prop) {
      const client = clientState.client;
      if (typeof prop === "string" && !(prop in (client ?? {}))) {
        throw new TypeError(
          `adminDb.${prop} does not exist on the real Drizzle client — do not mock it into existence.`,
        );
      }
      return client?.[prop];
    },
  }),
}));

vi.mock("@/server/db", () => ({
  db: new Proxy({} as any, {
    get(_target, prop) {
      const client = clientState.client;
      return client?.[prop];
    },
  }),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    execute: vi.fn(async () => []),
  }),
}));

async function usePostgresStub(args?: Parameters<typeof makeDbClientStub>[0]) {
  postgresStub = makeDbClientStub(args);
  clientState.client = postgresStub as any;
  const { configureTelephonyStub } = await import("./helpers/telephony-db-stub");
  configureTelephonyStub(postgresStub._telephonyConfig);
  return postgresStub;
}
vi.mock("@client/client-js", () => ({
  createClient: () => clientState.client,
}));

describe("api.auto-dial.status", () => {
  beforeEach(async () => {
    await usePostgresStub();
    twilioValidation.validateTwilioWebhookParams.mockReset();
    twilioValidation.validateTwilioWebhookParams.mockReturnValue(true);
    twilioValidation.requireTwilioSignature.mockReset();
    twilioValidation.requireTwilioSignature.mockImplementation(
      async (args: { params?: Record<string, string> }) => (null),
    );
    twilioClientMock.conferences.list.mockReset();
    twilioClientMock.conferences.list.mockResolvedValue([]);
    loggerMocks.error.mockReset();
    loggerMocks.debug.mockReset();
    campaignQueueDbMocks.updateError = null;
    campaignQueueDbMocks.updateCampaignQueueByContactAndCampaign.mockReset();
    loggerMocks.info.mockReset();
    rpcDequeueContactMock.mockReset();
    rpcDequeueContactMock.mockImplementation(async () => {});
    runAutoDialerTurnMock.mockReset();
    runAutoDialerTurnMock.mockResolvedValue({ success: true });
    emitPredictiveBroadcastMock.mockReset();
    emitPredictiveBroadcastMock.mockResolvedValue(null);
  });

  test("rejects invalid Twilio signature", async () => {
    twilioValidation.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "bad" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(403);
  }, 60000);

  test("bills idempotently for completed calls (same CallSid)", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const makeReq = () => {
      const fd = new FormData();
      fd.set("CallSid", "CA_DUP");
      fd.set("CallStatus", "completed");
      fd.set("Timestamp", new Date().toISOString());
      fd.set("Duration", "61");
      fd.set("CallDuration", "61");
      fd.set("ConferenceSid", "conf1");
      return new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      });
    };

    const r1 = await asRouteResponse(mod.action({ request: makeReq() } as any));
    expect(r1.status).toBe(200);
    const r2 = await asRouteResponse(mod.action({ request: makeReq() } as any));
    expect(r2.status).toBe(200);

    expect(postgresStub._transactionRows.length).toBeGreaterThan(0);
    const matching = postgresStub._transactionRows.filter(
      (r) => r.idempotency_key === "call:CA_DUP",
    );
    expect(matching.length).toBe(1);
  });

  test("billing kind is derived from campaign type", async () => {
    postgresStub = await usePostgresStub({ campaignType: "robocall" } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_IVR_KIND");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "61");
    fd.set("CallDuration", "61");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(postgresStub._transactionRows.length).toBeGreaterThan(0);
    const matching = postgresStub._transactionRows.filter(
      (r) => r.idempotency_key === "call:CA_IVR_KIND",
    );
    expect(matching.length).toBe(1);
  });

  test("dequeues by fetched attempt without writing provider status to disposition", async () => {
    postgresStub = await usePostgresStub({ outreachDisposition: "completed" });
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "10");
    fd.set("CallDuration", "10");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(200);
    expect(telephonyStubState.outreachUpdateCalls.length).toBe(0);
    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contactId: 1 }),
    );
  });

  /**
   * Conference names are minted as `${userId}~${uuid}`, and dequeue_contact
   * binds this argument as ::uuid. Passing the raw name raised 22P02 on every
   * terminal call, so the contact was never dequeued and the dialer stopped
   * after a single call with the campaign stuck on "Running".
   */
  test("dequeues with the user id from the conference name, not the name itself", async () => {
    const userId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: `${userId}~9f3ae1b2-0000-4000-8000-00000000abcd`,
        contact_id: 1,
        campaign_id: 1,
      },
    } as any);

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "10");
    fd.set("CallDuration", "10");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));

    expect(res.status).toBe(200);
    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dequeuedById: userId }),
    );
  });

  test("returns 500 when call lookup fails", async () => {
    postgresStub = await usePostgresStub({ callSelectError: new Error("no call") } as any);

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
  });

  test("uses env TWILIO_AUTH_TOKEN when workspace has no twilio_data", async () => {
    postgresStub = await usePostgresStub({ workspaceAuthToken: null } as any);
    twilioValidation.validateTwilioWebhookParams.mockImplementation(
      (_params: any, _sig: any, _url: any, authToken: string) => {
        expect(authToken).toBe("test");
        return true;
      },
    );

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("participant-join updates call, queue, and answered_at without provider disposition", async () => {
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: null,
        contact_id: 1,
        campaign_id: 1,
      },
    } as any);

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(telephonyStubState.outreachUpdateCalls.length).toBeGreaterThan(0);
    expect(telephonyStubState.outreachUpdateCalls).toEqual([
      expect.objectContaining({ answered_at: expect.any(String) }),
    ]);
    expect(telephonyStubState.outreachUpdateCalls[0]).not.toHaveProperty("disposition");
    expect(campaignQueueDbMocks.updateCampaignQueueByContactAndCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 1, campaignId: 1 }),
    );
  });

  test("participant-leave completes conferences and sets completed status", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF_A" }, { sid: "CONF_B" }]);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "u1~00000000-0000-0000-0000-000000000000");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("call status busy triggers dialer in-process (no HTTP self-fetch) when conferences exist and status not completed", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF1" }]);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_BUSY");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    // Regression guard: the dialer turn must be invoked in-process, not via a
    // self-fetch to /api/auto-dial/dialer (that path is matched by the
    // Twilio webhook prefix and an unsigned self-fetch would 403 in
    // production). See app/lib/auto-dial.server.ts:runAutoDialerTurn.
    expect(runAutoDialerTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: 1, workspace_id: "w1" }),
    );
  });

  test("triggerAutoDialer error bubbles to 500 when the in-process dialer turn fails", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF1" }]);
    runAutoDialerTurnMock.mockResolvedValueOnce({ success: false, error: "no queue" });
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_BUSY");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
  });

  test("updateOutreachAttempt catch path returns Response (still returns success)", async () => {
    postgresStub = await usePostgresStub({
      outreachFetchError: new Error("fetch"),
      outreachUpdateError: new Error("oa"),
    } as any);

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("updateOutreachAttempt works without disposition (covers else path)", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.action.server");
    const res = await mod.updateOutreachAttempt("1", "w1", {
      answered_at: new Date().toISOString(),
    } as any);
    expect(res).toMatchObject({ answered_at: expect.any(String) });
    expect(telephonyStubState.outreachUpdateCalls.length).toBeGreaterThan(0);
  });

  test("updateOutreachAttempt catch formats non-Error as Unknown error", async () => {
    postgresStub = await usePostgresStub({ outreachUpdateThrows: "nope" } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.action.server");
    const res = (await mod.updateOutreachAttempt("1", "w1", {
      answered_at: new Date().toISOString(),
    } as any)) as any;
    expect(res.status).toEqual(expect.any(Number));
    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toContain("Unknown error");
  });

  test("updateCall error path returns 500", async () => {
    postgresStub = await usePostgresStub({ callUpdateError: new Error("up") } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith("Error in handleCallStatus:", expect.any(Error));
  });

  test("rpc dequeue_contact error returns 500", async () => {
    rpcDequeueContactMock.mockRejectedValue(new Error("dq"));
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contactId: 1 }),
    );
    expect(loggerMocks.error).toHaveBeenCalledWith("Error in handleCallStatus:", expect.any(Error));
  });

  test("participant-leave outreach fetch error returns 500", async () => {
    postgresStub = await usePostgresStub({ outreachFetchError: new Error("out") } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "u1~00000000-0000-0000-0000-000000000000");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
  });

  test("participant-leave catch branch returns 500 when conferences.list throws", async () => {
    twilioClientMock.conferences.list.mockRejectedValueOnce(new Error("list"));
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-leave");
    fd.set("ReasonParticipantLeft", "participant_hung_up");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "2");
    fd.set("FriendlyName", "u1~00000000-0000-0000-0000-000000000000");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error in handleParticipantLeave:",
      expect.any(Error),
    );
  });

  test("participant-join does nothing when conference_id exists and no outreach_attempt_id", async () => {
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: null,
      conference_id: "u1~00000000-0000-0000-0000-000000000000",
        contact_id: 1,
        campaign_id: 1,
      },
    } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("replayed terminal status acks without re-dequeuing or re-dialing", async () => {
    twilioClientMock.conferences.list.mockResolvedValueOnce([{ sid: "CONF1" }]);
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA_REPLAY",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: "u1~00000000-0000-0000-0000-000000000000",
        contact_id: 1,
        campaign_id: 1,
        // First delivery already wrote the terminal status onto the row.
        status: "busy",
      },
    } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_REPLAY");
    fd.set("CallStatus", "busy");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, replay: true });
    // The dangerous side effects must not run again: no re-dequeue, no new
    // outbound call, no billing.
    expect(rpcDequeueContactMock).not.toHaveBeenCalled();
    expect(runAutoDialerTurnMock).not.toHaveBeenCalled();
    expect(postgresStub._transactionRows.length).toBe(0);
  });

  test("a different terminal status for the same call still processes", async () => {
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA_PROGRESS",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: "u1~00000000-0000-0000-0000-000000000000",
        contact_id: 1,
        campaign_id: 1,
        status: "ringing",
      },
    } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_PROGRESS");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "10");
    fd.set("CallDuration", "10");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(rpcDequeueContactMock).toHaveBeenCalled();
  });

  test("replayed participant-join does not restamp answered_at", async () => {
    postgresStub = await usePostgresStub({
      outreachAnsweredAt: "2026-08-05T00:00:00.000Z",
      dbCall: {
        sid: "CA1",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: "u1~00000000-0000-0000-0000-000000000000",
        contact_id: 1,
        campaign_id: 1,
      },
    } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(telephonyStubState.outreachUpdateCalls.length).toBe(0);
  });

  // Predictive contact calls send status callbacks only to this route (see
  // statusCallback in app/lib/auto-dial.server.ts), so it must emit the
  // predictive_broadcast events the agent call screen subscribes to — the
  // generic /api/call-status side-effects job never runs for these calls.
  test("emits predictive_broadcast for contact-leg progress statuses", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(emitPredictiveBroadcastMock).toHaveBeenCalledWith("w1", {
      contact_id: 1,
      status: "ringing",
    });
  });

  test("emits predictive_broadcast for terminal statuses before dequeue handling", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(emitPredictiveBroadcastMock).toHaveBeenCalledWith("w1", {
      contact_id: 1,
      status: "completed",
    });
  });

  test("does not emit predictive_broadcast for calls without a contact (agent leg)", async () => {
    postgresStub = await usePostgresStub({
      dbCall: {
        sid: "CA_AGENT",
        workspace: "w1",
        outreach_attempt_id: 1,
        conference_id: "u1~00000000-0000-0000-0000-000000000000",
        contact_id: null,
        campaign_id: 1,
      },
    } as any);
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA_AGENT");
    fd.set("CallStatus", "in-progress");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
    expect(emitPredictiveBroadcastMock).not.toHaveBeenCalled();
  });

  test("CallStatus failed is handled", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "failed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("default branch does nothing when callback event not recognized", async () => {
    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "other");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(200);
  });

  test("action catch formats non-Error as Unknown error", async () => {
    const dbMod = await import("../app/lib/database/workspace.server");
    (dbMod.createWorkspaceTwilioInstance as any).mockRejectedValueOnce("nope");

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "completed");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("Duration", "1");
    fd.set("CallDuration", "1");
    fd.set("ConferenceSid", "conf1");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("Unknown error") });
  });

  test("participant-join campaign_queue update error hits updateCampaignQueue + join catch branches", async () => {
    postgresStub = await usePostgresStub({ campaignQueueUpdateError: new Error("cq") } as any);

    const mod = await import("../app/routes/api+/auto-dial/status.route");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("CallStatus", "ringing");
    fd.set("StatusCallbackEvent", "participant-join");
    fd.set("Timestamp", new Date().toISOString());
    fd.set("ConferenceSid", "conf1");
    fd.set("FriendlyName", "in-progress");
    const res = await asRouteResponse(mod.action({
      request: new Request("http://localhost/api/auto-dial/status", {
        method: "POST",
        headers: { "x-twilio-signature": "good" },
        body: fd,
      }),
    } as any));
    expect(res.status).toBe(500);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error updating campaign queue:",
      expect.any(Error),
    );
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Error in handleParticipantJoin:",
      expect.any(Error),
    );
  });
});

