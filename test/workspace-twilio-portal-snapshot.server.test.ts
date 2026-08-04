import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  message: {
    count: vi.fn(),
  },
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

import { getWorkspaceRecentOutboundMessageCount } from "../app/lib/database/workspace-twilio-portal-snapshot.server";

describe("getWorkspaceRecentOutboundMessageCount", () => {
  beforeEach(() => {
    tdbMocks.message.count.mockReset();
  });

  test("returns the workspace-scoped outbound-api message count", async () => {
    tdbMocks.message.count.mockResolvedValue(42);

    const result = await getWorkspaceRecentOutboundMessageCount({
      workspaceId: "workspace-1",
    });

    expect(result).toBe(42);
    expect(tdbMocks.message.count).toHaveBeenCalledTimes(1);
    const callArgs = tdbMocks.message.count.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.where).toBeDefined();
  });

  test("returns zero when the workspace has no outbound-api messages", async () => {
    tdbMocks.message.count.mockResolvedValue(0);

    const result = await getWorkspaceRecentOutboundMessageCount({
      workspaceId: "workspace-2",
    });

    expect(result).toBe(0);
  });
});
