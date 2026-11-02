import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.server";

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

const admissionMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/predictive-voice-admission.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/predictive-voice-admission.server")>(),
  admitPredictiveVoiceRecipient: admissionMock,
}));

const rpcMocks = vi.hoisted(() => ({
  rpcTryCompleteCampaignIfDrained: vi.fn(),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcTryCompleteCampaignIfDrained: (...args: unknown[]) =>
    rpcMocks.rpcTryCompleteCampaignIfDrained(...args),
}));

// Spreads the real module: only the keyed write is asserted here, and a frozen
// factory breaks the day the module gains an export.
vi.mock("@/lib/campaign-queue-updates.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-updates.server")>()),
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

const tenantDbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  findAudio: vi.fn(async () => null),
  findAudioReservation: vi.fn(async () => null),
}));

vi.mock("@/server/tenant-db", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/tenant-db")>(),
  createTenantDb: vi.fn(() => ({
    call: {
      findFirst: (...args: unknown[]) => tenantDbMocks.findFirst(...args),
      update: (...args: unknown[]) => tenantDbMocks.update(...args),
      insert: (...args: unknown[]) => tenantDbMocks.insert(...args),
    },
    execute: (...args: unknown[]) => tenantDbMocks.execute(...args),
    workspace_voice_audio_connection: { findFirst: (...args: unknown[]) => tenantDbMocks.findAudio(...args) },
    workspace_voice_reservation: { findFirst: (...args: unknown[]) => tenantDbMocks.findAudioReservation(...args) },
  })),
}));

import {
  completeAllConferences,
  createTwilioCall,
  runAutoDialerTurn,
  saveCallToDatabase,
} from "../app/lib/auto-dial.server";

describe("auto-dial.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admissionMock.mockReset().mockResolvedValue({ ok: false, reason: "queue_empty" });
  });

  test("createTwilioCall uses BASE_URL callbacks", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "CA123" });
    const client = { calls: { create } };
    await createTwilioCall(
      client as never,
      "+15551234567",
      "+15557654321",
      "conf-1",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551234567",
        from: "+15557654321",
        url: "https://example.test/api/auto-dial/conf-1",
        statusCallback: "https://example.test/api/auto-dial/status",
        // Predictive dialing keeps synchronous AMD: there is no agent
        // on the line, so a machine must be detected and dropped/hung up.
        machineDetection: "Enable",
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

  test("saveCallToDatabase persists queue_id on insert (#1222)", async () => {
    // buildCallRow used to silently drop `queue_id`, so the manual dial path
    // wrote `call.queue_id = NULL` even when the dial action carried it —
    // making it impossible to key call rows back to their queue entry.
    tenantDbMocks.findFirst.mockResolvedValue(null);
    tenantDbMocks.insert.mockResolvedValue([]);
    await saveCallToDatabase("ws-1", {
      sid: "CA-Q1",
      status: "completed",
      campaign_id: 1,
      contact_id: 2,
      queue_id: 3,
    });
    expect(tenantDbMocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA-Q1", queue_id: 3 }),
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

  test("an ended predictive conference cannot claim a queued contact or place another call", async () => {
    twilioMocks.conferencesList.mockResolvedValueOnce([]);
    const result = await runAutoDialerTurn({
      user_id: "agent-1",
      workspace_id: "ws-1",
      campaign_id: 5,
      conference_id: "agent-1~campaign-5",
      selected_device: "",
    });
    expect(result).toEqual({ success: true, message: "Conference ended, stopping auto-dial" });
    expect(admissionMock).not.toHaveBeenCalled();
    expect(twilioMocks.callsCreate).not.toHaveBeenCalled();
  });

  // Funding, window selection and provider failures use real SQL in
  // integration-db/voice-credit-predictive.test.ts. This adapter owns drain handling.
  describe("runAutoDialerTurn admission outcomes", () => {
    const input = { user_id: "user-1", workspace_id: "ws-1", campaign_id: 5, conference_id: "user-1" };
    test("asks the completion gate only when admission proves the queue is empty", async () => {
      rpcMocks.rpcTryCompleteCampaignIfDrained.mockResolvedValueOnce(true);
      expect(await runAutoDialerTurn(input)).toMatchObject({ success: true });
      expect(rpcMocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledWith(expect.anything(), 5);
      expect(twilioMocks.callsCreate).not.toHaveBeenCalled();
    });
    test.each(["queue_pending", "outside_window", "insufficient_credits", "dispatch_in_progress", "campaign_deferred"])(
      "%s cannot complete the campaign or send a provider call", async (reason) => {
        admissionMock.mockResolvedValueOnce({ ok: false, reason });
        expect(await runAutoDialerTurn(input)).toMatchObject({ success: true });
        expect(rpcMocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();
        expect(twilioMocks.callsCreate).not.toHaveBeenCalled();
      },
    );
    test("a completion-label failure does not fail the drained turn", async () => {
      rpcMocks.rpcTryCompleteCampaignIfDrained.mockRejectedValueOnce(new Error("db down"));
      expect(await runAutoDialerTurn(input)).toMatchObject({ success: true });
      expect(logger.warn).toHaveBeenCalledWith("campaign.completion_failed", {
        campaignId: 5, workspaceId: "ws-1", reason: "auto_dial_drain", error: "db down",
      });
    });
  });
});
