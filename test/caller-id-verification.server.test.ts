import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const twilioMock = vi.hoisted(() => ({
  createWorkspaceTwilioInstance: vi.fn(),
  validationCreate: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...a: unknown[]) =>
    twilioMock.createWorkspaceTwilioInstance(...a),
}));

vi.mock("@/lib/env.server", () => ({
  env: { BASE_URL: () => "https://example.test" },
}));

const tdbMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    workspace_number: {
      findFirst: (...a: unknown[]) => tdbMock.findFirst(...a),
      update: (...a: unknown[]) => tdbMock.update(...a),
      insert: (...a: unknown[]) => tdbMock.insert(...a),
    },
  }),
}));

const emitMock = vi.hoisted(() => ({ emit: vi.fn(async () => null) }));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workspace-events.server")>();
  return { ...actual, emitWorkspaceNumberEvent: emitMock.emit };
});

import { startWorkspaceCallerIdVerification } from "../app/lib/caller-id-verification.server";

describe("startWorkspaceCallerIdVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    twilioMock.createWorkspaceTwilioInstance.mockResolvedValue({
      validationRequests: { create: (...a: unknown[]) => twilioMock.validationCreate(...a) },
    });
    twilioMock.validationCreate.mockResolvedValue({
      accountSid: "AC1",
      callSid: "CA1",
      friendlyName: "Cell",
      phoneNumber: "+15555550100",
      validationCode: "123456",
    });
    tdbMock.update.mockResolvedValue([{ id: 1, workspace: "w1" }]);
    tdbMock.insert.mockResolvedValue([{ id: 1, workspace: "w1" }]);
  });

  test("refuses to demote a rented number and never places a Twilio validation call (#1518)", async () => {
    tdbMock.findFirst.mockResolvedValue({ id: 9, type: "rented" });

    await expect(
      startWorkspaceCallerIdVerification({
        workspaceId: "w1",
        phoneNumber: "+15555550100",
        friendlyName: "Cell",
      }),
    ).rejects.toThrow(/already rented/i);

    expect(twilioMock.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
    expect(tdbMock.update).not.toHaveBeenCalled();
  });

  test("verifies a non-rented existing caller-id row", async () => {
    tdbMock.findFirst.mockResolvedValue({ id: 9, type: "caller_id" });
    tdbMock.update.mockResolvedValue([{ id: 9, workspace: "w1" }]);

    const result = await startWorkspaceCallerIdVerification({
      workspaceId: "w1",
      phoneNumber: "+15555550100",
      friendlyName: "Cell",
    });

    expect(twilioMock.validationCreate).toHaveBeenCalled();
    expect(tdbMock.update).toHaveBeenCalled();
    expect(result.validationRequest.validationCode).toBe("123456");

    // Live-update the numbers page to "pending" so no reload is needed (#1740).
    expect(emitMock.emit).toHaveBeenCalledWith(
      "w1",
      "UPDATE",
      expect.objectContaining({ id: 9 }),
      null,
    );
  });

  test("emits an INSERT workspace-number event when the caller id is new", async () => {
    tdbMock.findFirst.mockResolvedValue(null);
    tdbMock.insert.mockResolvedValue([{ id: 11, workspace: "w1" }]);

    await startWorkspaceCallerIdVerification({
      workspaceId: "w1",
      phoneNumber: "+15555550100",
      friendlyName: "Cell",
    });

    expect(emitMock.emit).toHaveBeenCalledWith(
      "w1",
      "INSERT",
      expect.objectContaining({ id: 11 }),
      null,
    );
  });
});
