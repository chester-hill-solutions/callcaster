import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
  findCampaignTypeByCampaignId: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCampaignTypeByCampaignId: (...args: unknown[]) =>
    mocks.findCampaignTypeByCampaignId(...args),
  findCallBySid: vi.fn(),
  upsertCallBySid: vi.fn(),
  updateCallBySid: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  findOutreachAttemptById: vi.fn(),
  findOutreachAttemptWithCampaignType: vi.fn(),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  emitPostgresChangeEvent: vi.fn(),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

import type { Tables } from "@/lib/db-types";

function makeTerminalChildCall(overrides: Partial<Tables<"call">> = {}): Tables<"call"> {
  return {
    sid: "CAchild123",
    workspace: "ws-1",
    parent_call_sid: "CAparent456",
    status: "completed",
    duration: "61",
    call_duration: null,
    campaign_id: 42,
    contact_id: 99,
    outreach_attempt_id: 10,
    user_id: "user-1",
    account_sid: "ACtest",
    to: "+15551234567",
    from: "+15559876543",
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    date_created: new Date().toISOString(),
    date_updated: new Date().toISOString(),
    direction: "outbound-api",
    api_version: "2010-04-01",
    forwarded_from: null,
    caller_name: null,
    price: null,
    recording_duration: null,
    recording_sid: null,
    recording_url: null,
    is_last: false,
    ...overrides,
  };
}

describe("billTerminalCallStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCampaignTypeByCampaignId.mockResolvedValue("staffed");
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: true,
      existingId: 101,
    });
  });

  test("terminal billable child call creates exactly one ledger debit", async () => {
    const { billTerminalCallStatus } = await import(
      "@/lib/twilio-call-status.server"
    );
    const call = makeTerminalChildCall();

    const result = await billTerminalCallStatus(call);

    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "DEBIT",
        idempotencyKey: "call:CAchild123",
        callSid: "CAchild123",
        campaignId: 42,
      }),
    );
    expect(mocks.insertTransactionHistoryIdempotent.mock.calls[0][0].amount).toBeLessThan(0);
    expect(mocks.insertTransactionHistoryIdempotent.mock.calls[0][0].note).toContain("CAchild123");
    expect(result).toEqual({ inserted: true, existingId: 101 });
  });

  test("idempotent callback does not double-debit", async () => {
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue({
      inserted: false,
      existingId: 101,
    });
    const { billTerminalCallStatus } = await import(
      "@/lib/twilio-call-status.server"
    );
    const call = makeTerminalChildCall();

    const result = await billTerminalCallStatus(call);

    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "call:CAchild123",
      }),
    );
    expect(result).toEqual({ inserted: false, existingId: 101 });
  });

  test("zero-duration/no-answer does not debit", async () => {
    const { billTerminalCallStatus } = await import(
      "@/lib/twilio-call-status.server"
    );
    const call = makeTerminalChildCall({
      status: "no-answer",
      duration: "0",
    });

    const result = await billTerminalCallStatus(call);

    expect(result).toBeNull();
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });
});
