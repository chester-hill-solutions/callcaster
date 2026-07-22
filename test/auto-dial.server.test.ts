import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const envMock = vi.hoisted(() => ({
  BASE_URL: vi.fn(() => "https://example.test"),
}));

vi.mock("@/lib/env.server", () => ({ env: envMock }));
vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const rpcMocks = vi.hoisted(() => ({
  rpcCreateOutreachAttempt: vi.fn(),
  rpcDequeueContact: vi.fn(),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: (...args: unknown[]) => rpcMocks.rpcCreateOutreachAttempt(...args),
  rpcDequeueContact: (...args: unknown[]) => rpcMocks.rpcDequeueContact(...args),
}));

const claimNextQueueContactMock = vi.hoisted(() => vi.fn());
const requeueCampaignQueueByIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/campaign-queue-db.server", () => ({
  claimNextQueueContact: (...args: unknown[]) => claimNextQueueContactMock(...args),
  requeueCampaignQueueById: (...args: unknown[]) =>
    requeueCampaignQueueByIdMock(...args),
}));

const twilioMocks = vi.hoisted(() => ({
  callsCreate: vi.fn(),
  conferencesList: vi.fn(async () => []),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    calls: { create: (...args: unknown[]) => twilioMocks.callsCreate(...args) },
    conferences: Object.assign(
      () => ({ update: vi.fn(), participants: { list: vi.fn(async () => []) } }),
      { list: (...args: unknown[]) => twilioMocks.conferencesList(...args) },
    ),
  })),
}));

const windowMock = vi.hoisted(() => ({
  recipientCallingWindowStatus: vi.fn(),
}));
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: (...args: unknown[]) =>
    windowMock.recipientCallingWindowStatus(...args),
}));

const tenantDbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      findFirst: (...args: unknown[]) => tenantDbMocks.findFirst(...args),
      update: (...args: unknown[]) => tenantDbMocks.update(...args),
      insert: (...args: unknown[]) => tenantDbMocks.insert(...args),
    },
    execute: (...args: unknown[]) => tenantDbMocks.execute(...args),
  })),
}));

import {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  normalizePhoneNumber,
  runAutoDialerTurn,
  saveCallToDatabase,
} from "../app/lib/auto-dial.server";

describe("auto-dial.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMocks.rpcCreateOutreachAttempt.mockReset();
    claimNextQueueContactMock.mockReset();
  });

  test("normalizePhoneNumber re-exports shared helper", () => {
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("+15551234567");
  });

  test("getNextAutoDialQueueContact returns first record", async () => {
    claimNextQueueContactMock.mockResolvedValueOnce({ queue_id: 1 });
    const result = await getNextAutoDialQueueContact(1, "user-1");
    expect(result).toEqual({ queue_id: 1 });
    expect(claimNextQueueContactMock).toHaveBeenCalledWith(expect.anything(), 1, "user-1");
  });

  test("getNextAutoDialQueueContact returns null when empty", async () => {
    claimNextQueueContactMock.mockResolvedValueOnce(null);
    expect(await getNextAutoDialQueueContact(1, "user-1")).toBeNull();
  });

  test("getNextAutoDialQueueContact throws on rpc error", async () => {
    claimNextQueueContactMock.mockRejectedValueOnce(new Error("rpc fail"));
    await expect(
      getNextAutoDialQueueContact(1, "user-1"),
    ).rejects.toThrow("rpc fail");
  });

  test("createOutreachAttempt calls rpc and returns data", async () => {
    rpcMocks.rpcCreateOutreachAttempt.mockResolvedValueOnce({ id: 9 });
    const result = await createOutreachAttempt(
      { queue_id: 1, contact_id: 2, contact_phone: "+15551234567" },
      3,
      "ws-1",
      "user-1",
    );
    expect(result).toEqual({ id: 9 });
    expect(rpcMocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(expect.anything(), {
      contactId: 2,
      campaignId: 3,
      userId: "user-1",
      workspaceId: "ws-1",
      queueId: 1,
    });
  });

  test("createTwilioCall uses BASE_URL callbacks", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "CA123" });
    const client = { calls: { create } };
    await createTwilioCall(
      client as never,
      "+15551234567",
      "+15557654321",
      "conf-1",
      "device-1",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551234567",
        from: "+15557654321",
        url: "https://example.test/api/auto-dial/conf-1",
        statusCallback: "https://example.test/api/auto-dial/status",
      }),
    );
  });

  test("saveCallToDatabase skips when sid missing", async () => {
    await saveCallToDatabase("ws-1", {});
    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
  });

  test("saveCallToDatabase inserts call row when missing", async () => {
    tenantDbMocks.findFirst.mockResolvedValue(null);
    tenantDbMocks.insert.mockResolvedValue([]);
    await saveCallToDatabase("ws-1", {
      sid: "CA123",
      status: "completed",
      campaign_id: 1,
    });
    expect(tenantDbMocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA123", campaign_id: 1 }),
    );
  });

  test("saveCallToDatabase updates call row when existing", async () => {
    tenantDbMocks.findFirst.mockResolvedValue({ sid: "CA123" });
    tenantDbMocks.update.mockResolvedValue([]);
    await saveCallToDatabase("ws-1", {
      sid: "CA123",
      status: "completed",
      campaign_id: 1,
    });
    expect(tenantDbMocks.update).toHaveBeenCalled();
  });

  test("completeAllConferences completes in-progress conferences", async () => {
    const update = vi.fn();
    const client = {
      conferences: Object.assign(
        vi.fn(() => ({ update })),
        {
          list: vi.fn().mockResolvedValue([{ sid: "CF1" }, { sid: "CF2" }]),
        },
      ),
    };
    await completeAllConferences(client as never, "user-1");
    expect(update).toHaveBeenCalledTimes(2);
  });

  describe("runAutoDialerTurn recipient calling window", () => {
    const turnInput = {
      user_id: "user-1",
      workspace_id: "ws-1",
      campaign_id: 5,
      conference_id: "user-1",
      selected_device: "",
    };
    const contactA = {
      queue_id: 11,
      contact_id: 101,
      contact_phone: "+17095550100",
      caller_id: "+15555501001",
    };
    const contactB = {
      queue_id: 12,
      contact_id: 102,
      contact_phone: "+16045550100",
      caller_id: "+15555501001",
    };
    const blocked = {
      allowed: false,
      timezone: "America/St_Johns",
      reason: "outside_window",
    };
    const open = {
      allowed: true,
      timezone: "America/Vancouver",
      reason: "in_window",
    };

    test("requeues out-of-window contacts and stops without dialing", async () => {
      // The released row is claimable again immediately; seeing it a second
      // time proves everything claimable is out of window.
      claimNextQueueContactMock
        .mockResolvedValueOnce(contactA)
        .mockResolvedValueOnce(contactA);
      windowMock.recipientCallingWindowStatus.mockReturnValue(blocked);

      const result = await runAutoDialerTurn(turnInput);

      expect(requeueCampaignQueueByIdMock).toHaveBeenCalledTimes(2);
      expect(requeueCampaignQueueByIdMock).toHaveBeenCalledWith(11, "ws-1");
      expect(twilioMocks.callsCreate).not.toHaveBeenCalled();
      expect(rpcMocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: "No contacts within recipient calling hours",
      });
    });

    test("skips a blocked contact and dials the next in-window one", async () => {
      claimNextQueueContactMock
        .mockResolvedValueOnce(contactA)
        .mockResolvedValueOnce(contactB);
      windowMock.recipientCallingWindowStatus
        .mockReturnValueOnce(blocked)
        .mockReturnValueOnce(open);
      rpcMocks.rpcCreateOutreachAttempt.mockResolvedValue(77);
      twilioMocks.callsCreate.mockResolvedValue({
        sid: "CA123",
        status: "queued",
      });
      tenantDbMocks.findFirst.mockResolvedValue(null);
      tenantDbMocks.insert.mockResolvedValue([{ sid: "CA123" }]);

      const result = await runAutoDialerTurn(turnInput);

      expect(requeueCampaignQueueByIdMock).toHaveBeenCalledTimes(1);
      expect(requeueCampaignQueueByIdMock).toHaveBeenCalledWith(11, "ws-1");
      expect(twilioMocks.callsCreate).toHaveBeenCalledTimes(1);
      expect(twilioMocks.callsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+16045550100" }),
      );
      expect(rpcMocks.rpcDequeueContact).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ contactId: 102 }),
      );
      expect(result).toEqual({ success: true });
    });
  });
});
