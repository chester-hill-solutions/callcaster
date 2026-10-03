import { beforeEach, describe, expect, test, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), execute: vi.fn(), credentials: vi.fn(), signature: vi.fn(),
  claim: vi.fn(), sweep: vi.fn(), release: vi.fn(), construct: vi.fn(), create: vi.fn(),
  baseUrl: vi.fn(), error: vi.fn(),
}));

vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env, BASE_URL: () => mocks.baseUrl() } };
});
vi.mock("@/lib/logger.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger.server")>();
  return { ...actual, logger: { ...actual.logger, error: (...args: unknown[]) => mocks.error(...args) } };
});
vi.mock("@/server/admin-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-db")>()),
  adminDb: { select: (...args: unknown[]) => mocks.select(...args), execute: (...args: unknown[]) => mocks.execute(...args) },
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcClaimInboundQueueEntry: (...args: unknown[]) => mocks.claim(...args),
  rpcResetStaleInboundOffers: (...args: unknown[]) => mocks.sweep(...args),
  rpcReleaseInboundOffer: (...args: unknown[]) => mocks.release(...args),
}));
vi.mock("@/twilio.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/twilio.server")>()),
  validateTwilioWebhookParams: (...args: unknown[]) => mocks.signature(...args),
}));
vi.mock("twilio/lib/rest/Twilio.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("twilio/lib/rest/Twilio.js")>()),
  default: class {
    calls = { create: (...args: unknown[]) => mocks.create(...args) };
    constructor(...args: unknown[]) { mocks.construct(...args); }
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.baseUrl.mockReturnValue("https://base.example");
  mocks.signature.mockReturnValue(true);
  mocks.credentials.mockResolvedValue([{ twilio_data: { sid: "AC-valid", authToken: "test-token" } }]);
  mocks.select.mockImplementation(() => ({
    from: (table: Table) => ({ where: () => ({ limit: () => getTableName(table) === "workspace"
      ? mocks.credentials()
      : Promise.resolve([{ id: 7, workspace_id: "w1", name: "Queue", hold_audio: null }]),
    }) }),
  }));
  mocks.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);
  mocks.claim.mockResolvedValue({ agent_user_id: "agent-1", entry_id: 123 });
  mocks.sweep.mockResolvedValue(0);
  mocks.release.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ sid: "CA-agent" });
});

async function wait(queueTime = "0") {
  const { handleAcdRouterRequest } = await import("@/lib/acd/acd-router.server");
  return handleAcdRouterRequest(new Request("https://base.example/api/acd-router?queue_id=7", {
    method: "POST", headers: { "x-twilio-signature": "test-signature" },
    body: new URLSearchParams({ CallSid: "CA-caller", From: "+15550001111", QueueTime: queueTime }),
  }), "wait");
}

describe("ACD offer call-start boundary (#2130)", () => {
  test("reuses the credentials that validated the callback without a second lookup after claim", async () => {
    mocks.credentials.mockResolvedValueOnce([{ twilio_data: { sid: "AC-valid", authToken: "test-token" } }]).mockResolvedValueOnce([]);
    expect(await (await wait()).text()).toContain("queue");
    expect(mocks.credentials).toHaveBeenCalledTimes(1);
    expect(mocks.construct).toHaveBeenCalledWith("AC-valid", "test-token", expect.any(Object));
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  test("missing credentials cannot claim an agent and report the affected workspace and queue", async () => {
    mocks.credentials.mockResolvedValue([]);
    expect((await wait()).status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ workspaceId: "w1", queueId: 7 }));
  });

  test("a failed credential read reports context without creating an offer", async () => {
    const error = new Error("Credential database unavailable");
    mocks.credentials.mockRejectedValue(error);
    expect(await (await wait()).text()).toContain("Please wait");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("ACD workspace Twilio credentials could not be loaded",
      expect.objectContaining({ workspaceId: "w1", queueId: 7, error }));
  });

  test("an invalid signature cannot claim or dial an agent", async () => {
    mocks.signature.mockReturnValue(false);
    expect((await wait()).status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  test("required call URL configuration is checked before claim", async () => {
    mocks.baseUrl.mockImplementation(() => { throw new Error("Missing call URL"); });
    expect(await (await wait()).text()).toContain("<Hangup");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ workspaceId: "w1", queueId: 7 }));
  });

  test.each(["setup", "create"])("%s failure releases the exact offer and logs context without credentials", async (stage) => {
    if (stage === "setup") mocks.construct.mockImplementation(() => { throw new Error("SDK setup failed"); });
    else mocks.create.mockRejectedValue(new Error("Provider unavailable"));
    const xml = await (await wait()).text();
    expect(xml).toContain("queue");
    expect(mocks.release).toHaveBeenCalledWith(expect.anything(), { entryId: 123, outcome: "timed_out" });
    expect(mocks.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ workspaceId: "w1", queueId: 7, entryId: 123 }));
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("test-token");
  });

  test("a started call retains its offer for the real status callback", async () => {
    await wait();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      to: "client:agent_agent_1", from: "+15550001111",
      url: "https://base.example/api/acd-router/agent-bridge?queue_name=inbound_q_7&entry_id=123",
      statusCallback: "https://base.example/api/acd-router/agent-status?entry_id=123&queue_id=7",
    }));
    expect(mocks.release).not.toHaveBeenCalled();
  });

  test("an existing active offer does not need new call URL setup", async () => {
    mocks.execute.mockReset().mockResolvedValue([{ id: 123, status: "offered" }]);
    mocks.baseUrl.mockImplementation(() => { throw new Error("Missing call URL"); });
    expect(await (await wait()).text()).toContain("queue");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.baseUrl).not.toHaveBeenCalled();
  });

  test("maximum offer attempts stop before another claim", async () => {
    mocks.execute.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 5 }]);
    expect(await (await wait()).text()).toContain("<Hangup");
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  test("maximum queue time stops before another claim", async () => {
    expect(await (await wait("3601")).text()).toContain("<Hangup");
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
