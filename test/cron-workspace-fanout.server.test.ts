import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  listAllWorkspacesOrdered: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(async () => ({})),
  readTwilioWorkspaceCredentials: vi.fn(() => ({ sid: "AC_test" })),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-members-db.server")>()),
  listAllWorkspacesOrdered: (...args: unknown[]) =>
    mocks.listAllWorkspacesOrdered(...args),
}));

vi.mock(
  "@/lib/merge-workspace-twilio-data.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/merge-workspace-twilio-data.server")
    >()),
    loadWorkspaceTwilioData: (...args: unknown[]) =>
      mocks.loadWorkspaceTwilioData(...args),
  }),
);

vi.mock("@/lib/twilio-workspace-credentials", () => ({
  readTwilioWorkspaceCredentials: (...args: unknown[]) =>
    mocks.readTwilioWorkspaceCredentials(...args),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

import { runCronWorkspaceFanout } from "../app/lib/cron-workspace-fanout.server";

function makeWorkspace(overrides: Record<string, unknown> = {}) {
  return { id: "ws-1", name: "Alpha", disabled: false, ...overrides };
}

describe("runCronWorkspaceFanout — disabled workspaces (#2116)", () => {
  beforeEach(() => {
    mocks.listAllWorkspacesOrdered.mockReset();
    mocks.loadWorkspaceTwilioData.mockClear();
    mocks.readTwilioWorkspaceCredentials.mockClear();
    mocks.logger.info.mockClear();
    mocks.logger.error.mockClear();
    mocks.loadWorkspaceTwilioData.mockResolvedValue({});
    mocks.readTwilioWorkspaceCredentials.mockReturnValue({ sid: "AC_test" });
  });

  test("a disabled workspace does not run and is counted as skipped", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-off", name: "Suspended", disabled: true }),
    ]);
    const run = vi.fn(async () => ({}));

    const summary = await runCronWorkspaceFanout({
      job: "billing_reconcile",
      run,
    });

    expect(run).not.toHaveBeenCalled();
    expect(summary).toEqual({
      ok: true,
      processed: 0,
      skipped: 1,
      failed: 0,
      failures: [],
    });
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "billing_reconcile.fanout_skipped_disabled",
      { workspaceId: "ws-off" },
    );
  });

  /**
   * Kill-check for the test above. Inverting the guard must turn it red: if
   * `workspace.disabled` were ignored, `run` would fire and `skipped` would be
   * 0. The "does not run" assertion alone could pass against a `run` that
   * silently returned; the count is the independent half.
   */
  test("an enabled workspace still runs — the guard keys on `disabled` only", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-on", name: "Active", disabled: false }),
    ]);
    const run = vi.fn(async () => ({}));

    const summary = await runCronWorkspaceFanout({
      job: "billing_reconcile",
      run,
    });

    expect(run).toHaveBeenCalledWith("ws-on");
    expect(summary).toMatchObject({ processed: 1, skipped: 0, failed: 0 });
  });

  test("skips the disabled workspace but still runs the enabled one in the same sweep", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-on", disabled: false }),
      makeWorkspace({ id: "ws-off", disabled: true }),
    ]);
    const run = vi.fn(async () => ({}));

    const summary = await runCronWorkspaceFanout({ job: "billing_reconcile", run });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("ws-on");
    expect(summary).toMatchObject({ processed: 1, skipped: 1, failed: 0 });
  });

  /**
   * The opt-in that keeps `number_rental_billing` from stranding numbers.
   * A disabled workspace that is included must reach the handler, because that
   * handler is where the warn -> suspend -> release ladder lives.
   */
  test("includeDisabled runs a disabled workspace", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-off", disabled: true }),
    ]);
    const run = vi.fn(async () => ({}));

    const summary = await runCronWorkspaceFanout({
      job: "number_rental_billing",
      includeDisabled: true,
      run,
    });

    expect(run).toHaveBeenCalledWith("ws-off");
    expect(summary).toMatchObject({ processed: 1, skipped: 0, failed: 0 });
  });

  test("does not read Twilio credentials for a disabled workspace", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-off", disabled: true }),
    ]);

    await runCronWorkspaceFanout({
      job: "billing_reconcile",
      requireTwilioCredentials: true,
      run: async () => ({}),
    });

    expect(mocks.loadWorkspaceTwilioData).not.toHaveBeenCalled();
    expect(mocks.readTwilioWorkspaceCredentials).not.toHaveBeenCalled();
  });

  test("a workspace row with disabled undefined is treated as enabled", async () => {
    // `disabled` is `boolean not null` in the schema, but the fanout reads the
    // full row through an admin client. Guard against a falsy-but-undefined
    // value silently skipping every workspace.
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-legacy", name: "Legacy" },
    ]);
    const run = vi.fn(async () => ({}));

    const summary = await runCronWorkspaceFanout({ job: "billing_reconcile", run });

    expect(run).toHaveBeenCalledWith("ws-legacy");
    expect(summary).toMatchObject({ processed: 1, skipped: 0 });
  });

  test("a disabled workspace is skipped, not failed — the sweep continues", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      makeWorkspace({ id: "ws-off", disabled: true }),
      makeWorkspace({ id: "ws-on", disabled: false }),
    ]);

    const summary = await runCronWorkspaceFanout({
      job: "twilio_open_sync",
      run: async () => {
        throw new Error("boom");
      },
    });

    expect(summary.failures).toEqual([{ workspaceId: "ws-on", error: "boom" }]);
    expect(summary).toMatchObject({ processed: 0, skipped: 1, failed: 1 });
  });
});
