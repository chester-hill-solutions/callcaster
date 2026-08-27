import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// Voice side-effect runners take the callback the ROUTE parsed (#1243 E1), so
// fixtures stay raw Twilio bodies and go through the real parser rather than
// being hand-built union members that could drift from what a route produces.
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";

const mocks = vi.hoisted(() => ({
  findCallBySid: vi.fn(),
  billTerminalCallStatus: vi.fn(),
  resolveCallOutreachContext: vi.fn(),
  findOutreachAttemptWithCampaignType: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  emitPredictiveBroadcast: vi.fn(),
  dequeueQueueEntry: vi.fn(),
  tenantDb: {
    campaign: { findFirst: vi.fn(async () => null) },
    campaign_queue: { findFirst: vi.fn(async () => null) },
  },
  findMessageBySid: vi.fn(),
  insertTransactionHistoryIdempotent: vi.fn(),
  alertSmsGeoPermissionBlocked: vi.fn(async () => undefined),
  sendWorkspaceWebhookNotification: vi.fn(async () => ({ success: true })),
  updateCallBySid: vi.fn(),
  persistCallRecordingToStorage: vi.fn(),
  isBatchTranscriptionEnabled: vi.fn(),
  enqueueJob: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/worker/handlers/elevenlabs-batch-transcribe.server", () => ({
  isBatchTranscriptionEnabled: (...args: unknown[]) =>
    mocks.isBatchTranscriptionEnabled(...args),
}));

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...args: unknown[]) => mocks.findCallBySid(...args),
  findOutreachAttemptById: vi.fn(async () => null),
  findOutreachAttemptWithCampaignType: (...args: unknown[]) =>
    mocks.findOutreachAttemptWithCampaignType(...args),
  updateOutreachAttemptForWorkspace: (...args: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
  updateCallBySid: (...args: unknown[]) => mocks.updateCallBySid(...args),
}));

vi.mock("@/lib/twilio-call-status.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/twilio-call-status.server")>();
  return {
    ...actual,
    billTerminalCallStatus: (...args: unknown[]) =>
      mocks.billTerminalCallStatus(...args),
    resolveCallOutreachContext: (...args: unknown[]) =>
      mocks.resolveCallOutreachContext(...args),
  };
});

vi.mock("@/lib/workspace-events.server", () => ({
  emitPredictiveBroadcast: (...args: unknown[]) =>
    mocks.emitPredictiveBroadcast(...args),
}));

vi.mock("@/lib/message-db.server", () => ({
  findMessageBySid: (...args: unknown[]) => mocks.findMessageBySid(...args),
}));

vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));

vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: (...args: unknown[]) =>
    mocks.sendWorkspaceWebhookNotification(...args),
}));

vi.mock("@/lib/database/call-actions.server", () => ({
  cancelQueuedMessagesForCampaign: vi.fn(async () => undefined),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(async () => ({})),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => mocks.tenantDb),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
}));

vi.mock("@/lib/twilio-geo-permissions.server", () => ({
  alertSmsGeoPermissionBlocked: (...args: unknown[]) =>
    mocks.alertSmsGeoPermissionBlocked(...args),
}));

vi.mock("@/lib/twilio-lookup.server", () => ({
  markContactLineType: vi.fn(async () => undefined),
}));

vi.mock("@/lib/outreach-disposition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/outreach-disposition")>();
  return actual;
});

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/call-recording-storage.server", () => ({
  persistCallRecordingToStorage: (...args: unknown[]) =>
    mocks.persistCallRecordingToStorage(...args),
}));

describe("webhook side-effect handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA1",
      workspace: "w1",
      status: "completed",
      duration: "61",
      outreach_attempt_id: 10,
    });
    mocks.billTerminalCallStatus.mockResolvedValue({ inserted: true });
    // Batch transcription is default-off; individual tests opt in.
    mocks.isBatchTranscriptionEnabled.mockResolvedValue(false);
    mocks.enqueueJob.mockResolvedValue(undefined);
    mocks.resolveCallOutreachContext.mockResolvedValue({
      outreachAttemptId: 10,
      workspaceId: "w1",
    });
    mocks.findOutreachAttemptWithCampaignType.mockResolvedValue({
      disposition: "in-progress",
      contact_id: 123,
      workspace: "w1",
    });
    mocks.updateOutreachAttemptForWorkspace.mockResolvedValue({ id: 10 });
    mocks.findMessageBySid.mockResolvedValue({
      sid: "SM1",
      workspace: "w1",
      status: "delivered",
      num_segments: "1",
      num_media: "0",
    });
    mocks.persistCallRecordingToStorage.mockResolvedValue({
      ok: true,
      audioUrl: "w1/recording-CA1.mp3",
      skipped: false,
    });
  });

  test("runCallStatusSideEffects bills and emits predictive broadcast", async () => {
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "completed" }),
    });

    expect(mocks.billTerminalCallStatus).toHaveBeenCalled();
    expect(mocks.emitPredictiveBroadcast).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ contact_id: 123 }),
    );
    // #1218: a provider-terminal status stamps the disposition so the call
    // shows up in campaign results even when the browser never hit /api/hangup.
    expect(mocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      10,
      expect.objectContaining({ disposition: "completed", ended_at: expect.any(String) }),
    );
  });

  test.each([
    ["no-answer", "no-answer"],
    ["busy", "busy"],
    ["failed", "failed"],
  ])("runCallStatusSideEffects stamps %s as disposition", async (status, disposition) => {
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );
    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: status }),
    });
    expect(mocks.updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      10,
      expect.objectContaining({ disposition }),
    );
  });

  // #1362: a callee hang-up must collapse the queue entry exactly like
  // /api/hangup does, or the agent's nextRecipient keeps showing a finished
  // contact. The assignee comes from the queue row because a webhook has no
  // acting user, and the guarded RPC keeps a double hang-up idempotent.
  test("terminal status dequeues the contact's queue row with the row assignee", async () => {
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA1",
      workspace: "w1",
      status: "completed",
      contact_id: 123,
      campaign_id: 7,
      outreach_attempt_id: 10,
    });
    mocks.tenantDb.campaign_queue.findFirst.mockResolvedValueOnce({
      assigned_to_user_id: "user-1",
    });
    mocks.tenantDb.campaign.findFirst.mockResolvedValueOnce({
      group_household_queue: false,
    });
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "completed" }),
    });

    expect(mocks.dequeueQueueEntry).toHaveBeenCalledTimes(1);
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        by: { contactId: 123 },
        workspaceId: "w1",
        household: false,
        userId: "user-1",
        reason: "Call completed",
        exec: mocks.tenantDb,
      }),
    );
  });

  test("non-terminal status does not dequeue the queue row", async () => {
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA1",
      workspace: "w1",
      status: "in-progress",
      contact_id: 123,
      campaign_id: 7,
      outreach_attempt_id: 10,
    });
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "in-progress" }),
    });

    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
  });

  test("runCallStatusSideEffects never downgrades a terminal disposition (AMD voicemail)", async () => {    mocks.findOutreachAttemptWithCampaignType.mockResolvedValue({
      disposition: "voicemail",
      contact_id: 123,
      workspace: "w1",
    });
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );
    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "completed" }),
    });
    expect(mocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("runCallStatusSideEffects ignores non-terminal statuses", async () => {
    const { runCallStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );
    await runCallStatusSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({ CallSid: "CA1", CallStatus: "in-progress" }),
    });
    expect(mocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("runSmsStatusSideEffects bills terminal SMS", async () => {
    const { runSmsStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runSmsStatusSideEffects({
      messageSid: "SM1",
      twilioParams: { SmsSid: "SM1", SmsStatus: "delivered" },
    });

    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: "w1",
        type: "DEBIT",
      }),
    );
    expect(mocks.sendWorkspaceWebhookNotification).toHaveBeenCalled();
  });

  test("runSmsStatusSideEffects raises the geo-permission alert on Twilio 21408", async () => {
    mocks.findMessageBySid.mockResolvedValue({
      sid: "SM2",
      workspace: "w1",
      status: "failed",
      to: "+16045550100",
      num_segments: "1",
      num_media: "0",
    });
    const { runSmsStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runSmsStatusSideEffects({
      messageSid: "SM2",
      twilioParams: { SmsSid: "SM2", SmsStatus: "failed", ErrorCode: "21408" },
    });

    expect(mocks.alertSmsGeoPermissionBlocked).toHaveBeenCalledWith({
      workspaceId: "w1",
      messageSid: "SM2",
      to: "+16045550100",
    });
  });

  test("runSmsStatusSideEffects does not raise the geo alert for other error codes", async () => {
    const { runSmsStatusSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runSmsStatusSideEffects({
      messageSid: "SM1",
      twilioParams: { SmsSid: "SM1", SmsStatus: "delivered" },
    });

    expect(mocks.alertSmsGeoPermissionBlocked).not.toHaveBeenCalled();
  });

  test("runRecordingSideEffects enriches recording metadata", async () => {
    const { runRecordingSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runRecordingSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({
        CallSid: "CA1",
        AccountSid: "ACmain",
        RecordingSid: "RE1",
        RecordingDuration: "12",
      }),
    });

    expect(mocks.persistCallRecordingToStorage).toHaveBeenCalledWith({
      workspaceId: "w1",
      callSid: "CA1",
      accountSid: "ACmain",
      recordingSid: "RE1",
      existingAudioUrl: undefined,
    });
    expect(mocks.updateCallBySid).toHaveBeenCalledWith(
      "w1",
      "CA1",
      expect.objectContaining({
        recording_sid: "RE1",
        recording_duration: "12",
        audio_url: "w1/recording-CA1.mp3",
      }),
    );
  });

  test("runRecordingSideEffects does not enqueue batch transcription while the flag is off", async () => {
    const { runRecordingSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runRecordingSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({
        CallSid: "CA1",
        AccountSid: "ACmain",
        RecordingSid: "RE1",
        RecordingDuration: "12",
      }),
    });

    // Default-off: the recording still persists, but no batch job is queued.
    expect(mocks.isBatchTranscriptionEnabled).toHaveBeenCalledWith("w1");
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.persistCallRecordingToStorage).toHaveBeenCalled();
  });

  test("runRecordingSideEffects enqueues batch transcription once the flag is on", async () => {
    mocks.isBatchTranscriptionEnabled.mockResolvedValue(true);

    const { runRecordingSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await runRecordingSideEffects({
      callSid: "CA1",
      event: parseTwilioVoiceCallback({
        CallSid: "CA1",
        AccountSid: "ACmain",
        RecordingSid: "RE1",
        RecordingDuration: "12",
      }),
    });

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "elevenlabs_batch_transcribe",
        workspaceId: "w1",
        params: { callSid: "CA1" },
      }),
    );
  });

  test("runRecordingSideEffects logs and continues when persist fails", async () => {
    mocks.persistCallRecordingToStorage.mockResolvedValueOnce({
      ok: false,
      reason: "download_failed",
      error: "Twilio recording fetch failed (404 Not Found)",
    });

    const { runRecordingSideEffects } = await import(
      "@/lib/worker/webhook-side-effects.server"
    );

    await expect(
      runRecordingSideEffects({
        callSid: "CA1",
        event: parseTwilioVoiceCallback({
          CallSid: "CA1",
          AccountSid: "ACmain",
          RecordingSid: "RE1",
          RecordingDuration: "12",
        }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "call_recording.persist_skipped",
      expect.objectContaining({ reason: "download_failed" }),
    );
    expect(mocks.updateCallBySid).toHaveBeenCalledWith("w1", "CA1", {
      recording_sid: "RE1",
      recording_duration: "12",
    });
    const updatePayload = mocks.updateCallBySid.mock.calls.at(-1)?.[2] as Record<
      string,
      string
    >;
    expect(updatePayload.audio_url).toBeUndefined();
  });
});
