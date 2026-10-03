import { beforeEach, describe, expect, test, vi } from "vitest";
import { onboardingFixture } from "./fixtures/onboarding";

vi.hoisted(() => { process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test"; });
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), persist: vi.fn(), role: "admin" }));
vi.mock("@/lib/worker/handlers.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/handlers.server")>()),
  enqueueWorkspaceComplianceJob: (...args: unknown[]) => mocks.enqueue(...args),
}));
vi.mock("@/lib/onboarding/onboarding-persist.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding/onboarding-persist.server")>()),
  persistWorkspaceOnboardingState: (...args: unknown[]) => mocks.persist(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: async () => undefined,
  getUserRole: async () => ({ role: mocks.role }),
}));
vi.mock("@/lib/platform-onboarding-helpers.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-onboarding-helpers.server")>()),
  loadWorkspaceOnboardingView: async () => ({ onboarding: onboardingFixture(), readiness: {}, a2pBlockingIssues: [], rcsBlockingIssues: [], phoneNumbers: [], creditsBalance: 100 }),
}));

import { runOnboardingAction } from "@/lib/platform-onboarding.server";
import { dispatchAdminTwilioAction } from "@/lib/platform-admin-twilio.server";
const adminArgs = { workspaceId: "w1", actorUserId: "u1", actorUsername: "ops@example.com", actionName: "provision_workspace_a2p" };

describe("manual A2P actions queue the canonical compliance path", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.role = "admin";
    mocks.enqueue.mockResolvedValue(undefined); mocks.persist.mockResolvedValue(undefined);
  });
  test.each(["admin", "owner"])("%s onboarding reports queue acceptance only", async (role) => {
    mocks.role = role;
    const result = await runOnboardingAction("u1", "w1", "provision_a2p", {});
    expect(result).toMatchObject({ ok: true, result: { kind: "payload", data: { success: "A2P compliance setup is queued. Check Launch checks for the latest status." } } });
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith("w1", "onboarding_a2p_requested");
  });
  test("onboarding queue failure is an error with no success or step advance", async () => {
    mocks.enqueue.mockRejectedValue(new Error("Compliance queue unavailable"));
    expect(await runOnboardingAction("u1", "w1", "provision_a2p", {})).toEqual({ ok: false, error: "Compliance queue unavailable", status: 500 });
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  test("a member cannot queue provisioning", async () => {
    mocks.role = "member";
    expect(await runOnboardingAction("u1", "w1", "provision_a2p", {})).toMatchObject({ ok: false, status: 403 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  test("admin API adapter reports queue acceptance only", async () => {
    expect(await dispatchAdminTwilioAction(adminArgs)).toEqual({ ok: true, message: "A2P compliance setup is queued. Status will update after the worker runs." });
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith("w1", "admin_provision_a2p");
  });
  test("admin API queue failure cannot return success", async () => {
    mocks.enqueue.mockRejectedValue(new Error("Compliance queue unavailable"));
    expect(await dispatchAdminTwilioAction(adminArgs)).toEqual({ ok: false, error: "Compliance queue unavailable", status: 500 });
  });
});
