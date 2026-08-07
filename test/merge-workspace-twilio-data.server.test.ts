import { beforeEach, describe, expect, test, vi } from "vitest";

// Minimal drizzle-shaped admin-db mock backed by a single mutable row, so we
// can simulate a concurrent writer committing between a cache warm-up and a
// merge.
const state = vi.hoisted(() => ({
  twilioData: {} as Record<string, unknown>,
  forUpdateCalled: 0,
  writes: [] as string[],
}));

vi.mock("@/server/admin-db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.for = () => {
      state.forUpdateCalled++;
      return chain;
    };
    chain.limit = () => Promise.resolve([{ twilio_data: state.twilioData }]);
    return chain;
  };
  const client: Record<string, unknown> = {
    select: () => makeSelectChain(),
    update: () => ({
      set: (vals: { twilio_data: string }) => ({
        where: () => {
          state.writes.push(vals.twilio_data);
          state.twilioData = JSON.parse(vals.twilio_data);
          return Promise.resolve();
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { adminDb: client };
});

describe("mergeWorkspaceTwilioData (atomic)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.twilioData = {};
    state.forUpdateCalled = 0;
    state.writes = [];
  });

  test("reads fresh committed data under FOR UPDATE, not the stale per-process cache", async () => {
    state.twilioData = { brandSid: "BN1" };
    const mod = await import("../app/lib/merge-workspace-twilio-data.server");

    // Warm this process's cache with the current value.
    await mod.loadWorkspaceTwilioData("w1");

    // A concurrent writer (another process/path) commits a new key to the row.
    state.twilioData = { brandSid: "BN1", campaignSid: "CS1" };

    // The merge must see the FRESH row (with campaignSid), not the cached one,
    // or it would wipe campaignSid on write.
    let seen: Record<string, unknown> | undefined;
    const result = await mod.mergeWorkspaceTwilioData("w1", (current) => {
      seen = current;
      return { ...current, onboarding: { enabled: true } };
    });

    expect(seen).toEqual({ brandSid: "BN1", campaignSid: "CS1" });
    expect(result).toMatchObject({
      brandSid: "BN1",
      campaignSid: "CS1",
      onboarding: { enabled: true },
    });
    // Row was locked, and the persisted blob preserved the concurrent write.
    expect(state.forUpdateCalled).toBeGreaterThan(0);
    expect(JSON.parse(state.writes.at(-1)!)).toMatchObject({ campaignSid: "CS1" });
  });

  test("busts the cache after a merge so the next load returns the merged value", async () => {
    state.twilioData = { a: 1 };
    const mod = await import("../app/lib/merge-workspace-twilio-data.server");

    await mod.loadWorkspaceTwilioData("w1"); // cache { a: 1 }
    await mod.mergeWorkspaceTwilioData("w1", (current) => ({ ...current, b: 2 }));

    const reloaded = await mod.loadWorkspaceTwilioData("w1");
    expect(reloaded).toMatchObject({ a: 1, b: 2 });
  });
});
