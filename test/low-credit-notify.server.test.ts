import { beforeEach, describe, expect, test, vi } from "vitest";

const workspaceMocks = vi.hoisted(() => ({
  listAllWorkspacesOrdered: vi.fn(),
  listWorkspaceOwnerAdminEmails: vi.fn(),
}));

const creditsMocks = vi.hoisted(() => ({
  getWorkspaceCreditsBalance: vi.fn(),
}));

const twilioDataMocks = vi.hoisted(() => ({
  loadWorkspaceTwilioData: vi.fn(),
  mergeWorkspaceTwilioData: vi.fn(),
  patchWorkspaceTwilioData: vi.fn(),
}));

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email_1" }, error: null })),
}));

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

describe("app/lib/low-credit-notify.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(workspaceMocks)) fn.mockReset();
    for (const fn of Object.values(creditsMocks)) fn.mockReset();
    for (const fn of Object.values(twilioDataMocks)) fn.mockReset();
    resendMocks.send.mockReset();
    resendMocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    for (const fn of Object.values(loggerMocks)) fn.mockReset();

    workspaceMocks.listWorkspaceOwnerAdminEmails.mockResolvedValue([
      "owner@example.com",
    ]);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});
    twilioDataMocks.mergeWorkspaceTwilioData.mockImplementation(
      async (_workspaceId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>) =>
        updater({}),
    );
    twilioDataMocks.patchWorkspaceTwilioData.mockResolvedValue({});

    vi.doMock("@/lib/workspace-members-db.server", () => workspaceMocks);
    vi.doMock("@/lib/workspace-credits.server", () => creditsMocks);
    vi.doMock("@/lib/merge-workspace-twilio-data.server", () => twilioDataMocks);
    vi.doMock("@/lib/logger.server", () => ({ logger: loggerMocks }));
    vi.doMock("@/lib/env.server", () => ({
      env: {
        RESEND_API_KEY: () => "test-resend-key",
        BASE_URL: () => "https://app.example.com",
      },
    }));
    vi.doMock("resend", () => {
      class Resend {
        emails = { send: (...args: unknown[]) => resendMocks.send(...args) };
        constructor(_apiKey: string) {}
      }
      return { Resend };
    });
  });

  test("sends a notification when balance is below threshold and no marker is set", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(50);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 1, cleared: 0 });
    expect(workspaceMocks.listWorkspaceOwnerAdminEmails).toHaveBeenCalledWith("w1");
    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Callcaster <info@callcaster.ca>",
        to: ["owner@example.com"],
        subject: "Your CallCaster credits are running low",
      }),
    );
    expect(twilioDataMocks.patchWorkspaceTwilioData).toHaveBeenCalledWith(
      "w1",
      {
        lowCreditNotification: expect.objectContaining({
          balance: 50,
          notifiedAt: expect.any(String),
        }),
      },
    );
  });

  test("does not notify at exactly the threshold (fresh welcome-credit balance)", async () => {
    const { LOW_CREDIT_THRESHOLD } = await import("../shared/pricing");
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(LOW_CREDIT_THRESHOLD);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 0, cleared: 0 });
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  test("skips sending when a low-credit marker is already present", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(40);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({
      lowCreditNotification: { notifiedAt: "2026-07-01T00:00:00.000Z", balance: 60 },
    });

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 0, cleared: 0 });
    expect(resendMocks.send).not.toHaveBeenCalled();
    expect(twilioDataMocks.patchWorkspaceTwilioData).not.toHaveBeenCalled();
    expect(twilioDataMocks.mergeWorkspaceTwilioData).not.toHaveBeenCalled();
  });

  test("clears the marker once the balance recovers above the threshold", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(500);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({
      lowCreditNotification: { notifiedAt: "2026-07-01T00:00:00.000Z", balance: 40 },
    });

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 0, cleared: 1 });
    expect(resendMocks.send).not.toHaveBeenCalled();
    expect(twilioDataMocks.mergeWorkspaceTwilioData).toHaveBeenCalledWith(
      "w1",
      expect.any(Function),
    );
  });

  test("does not touch twilio_data when the balance is above the threshold and no marker exists", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(500);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 0, cleared: 0 });
    expect(resendMocks.send).not.toHaveBeenCalled();
    expect(twilioDataMocks.mergeWorkspaceTwilioData).not.toHaveBeenCalled();
    expect(twilioDataMocks.patchWorkspaceTwilioData).not.toHaveBeenCalled();
  });

  test("skips workspaces with no resolvable credit balance", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "missing" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(null);

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({ ok: true, checked: 1, notified: 0, cleared: 0 });
    expect(twilioDataMocks.loadWorkspaceTwilioData).not.toHaveBeenCalled();
  });

  test("marks notified but logs when a low-credit workspace has no owner/admin recipients", async () => {
    workspaceMocks.listAllWorkspacesOrdered.mockResolvedValue([{ id: "w1" }]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(10);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});
    workspaceMocks.listWorkspaceOwnerAdminEmails.mockResolvedValueOnce([]);

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify();

    expect(result).toMatchObject({
      ok: true,
      notified: 0,
      skippedNoRecipients: 1,
    });
    expect(resendMocks.send).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "low_credit_notify.no_recipients",
      { workspaceId: "w1" },
    );
    expect(twilioDataMocks.patchWorkspaceTwilioData).toHaveBeenCalled();
  });

  test("scopes to a single workspace when workspaceId is passed", async () => {
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(20);
    twilioDataMocks.loadWorkspaceTwilioData.mockResolvedValue({});

    const mod = await import("../app/lib/low-credit-notify.server");
    const result = await mod.runLowCreditNotify({ workspaceId: "w-specific" });

    expect(workspaceMocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(creditsMocks.getWorkspaceCreditsBalance).toHaveBeenCalledWith("w-specific");
    expect(result).toMatchObject({ ok: true, checked: 1, notified: 1 });
  });
});
