import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";

vi.mock("@/lib/env.server", () => ({
  env: {
    TWILIO_APP_SID: () => "APtest",
  },
}));

const workspaceMocks = vi.hoisted(() => ({
  getWorkspaceById: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: (...args: unknown[]) => workspaceMocks.getWorkspaceById(...args),
}));

describe("createHandsetAccessToken", () => {
  beforeEach(() => {
    workspaceMocks.getWorkspaceById.mockReset();
  });

  it("returns error when workspace is missing credentials", async () => {
    workspaceMocks.getWorkspaceById.mockResolvedValueOnce({
      twilio_data: { sid: "" },
      key: "",
      token: "",
    });

    const result = await createHandsetAccessToken({
      workspaceId: "ws-1",
      clientIdentity: "handset-1",
    });

    expect(result.token).toBeNull();
    expect(result.error).toContain("Twilio credentials");
  });

  it("returns error when workspace is not found", async () => {
    workspaceMocks.getWorkspaceById.mockResolvedValueOnce(null);

    const result = await createHandsetAccessToken({
      workspaceId: "ws-missing",
      clientIdentity: "handset-1",
    });

    expect(result.token).toBeNull();
    expect(result.error).toBe("Workspace not found");
  });
});
