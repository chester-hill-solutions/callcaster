import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { execute: mocks.execute },
  directPool: { listen: mocks.listen },
}));

import { probeDatabaseReadiness } from "@/server/db-health.server";

describe("database readiness", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.listen.mockReset();
    mocks.unlisten.mockReset();
  });

  test("checks query and LISTEN connections", async () => {
    mocks.execute.mockResolvedValue([]);
    mocks.listen.mockResolvedValue({ unlisten: mocks.unlisten });
    mocks.unlisten.mockResolvedValue(undefined);

    await expect(probeDatabaseReadiness()).resolves.toEqual({
      queryReady: true,
      listenReady: true,
    });
    expect(mocks.listen).toHaveBeenCalledWith(
      "callcaster_readiness_probe",
      expect.any(Function),
    );
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  test("reports LISTEN failures independently", async () => {
    mocks.execute.mockResolvedValue([]);
    mocks.listen.mockRejectedValue(new Error("direct connection unavailable"));

    await expect(probeDatabaseReadiness()).resolves.toEqual({
      queryReady: true,
      listenReady: false,
    });
  });
});
