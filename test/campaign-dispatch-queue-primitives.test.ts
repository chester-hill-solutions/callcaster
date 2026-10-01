import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The batch primitives the campaign IVR and SMS dispatchers now share.
 *
 * These were two byte-identical copies each — the phone-claim factory and the
 * #1513 exhaustion sweep — so the point of these tests is that the SHARED
 * version behaves as both dispatchers already relied on. The dispatchers' own
 * suites keep covering the paths that call them; these pin the two behaviours
 * that were previously duplicated along with the code, and so were duplicated
 * along with any bug:
 *
 * - a claim is settled by whoever gets there first, and every awaiter sees it;
 * - the exhaustion sweep does not run on a batch where nothing failed.
 */

const mocks = vi.hoisted(() => ({
  rpcFailExhaustedCampaignQueueContacts: vi.fn(async () => 3),
}));

vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcFailExhaustedCampaignQueueContacts: (
    ...args: unknown[]
  ) => mocks.rpcFailExhaustedCampaignQueueContacts(...(args as [])),
}));

const { createPhoneClaim, sweepExhaustedQueueContacts } = await import(
  "@/lib/campaign-dispatch-queue.server"
);

const executor = { execute: async () => [] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(3);
});

describe("createPhoneClaim", () => {
  // The whole point of the claim: sibling rows sharing a phone number wait on
  // one provider call, so the second awaiter must observe the FIRST row's
  // outcome rather than starting its own.
  test("every awaiter observes the one settled result", async () => {
    const claim = createPhoneClaim<{ sid: string }>();
    const first = claim.result;
    const sibling = claim.result;

    claim.resolve({ sid: "SM1" });

    await expect(first).resolves.toEqual({ sid: "SM1" });
    await expect(sibling).resolves.toEqual({ sid: "SM1" });
  });

  test("carries a typed result through to the awaiter", async () => {
    const claim = createPhoneClaim<{ sid: string }>();
    const settled = claim.result;
    claim.resolve({ sid: "SM42" });
    await expect(settled).resolves.toEqual({ sid: "SM42" });
  });
});

describe("sweepExhaustedQueueContacts", () => {
  // Kill-check for the clamp both dispatchers used to carry separately. Delete
  // the `failedCount <= 0` guard and this fails: the sweep is a database write,
  // so running it on a clean batch costs a round trip for nothing.
  test("does not run when no row failed", async () => {
    await expect(sweepExhaustedQueueContacts(executor, "10", 0)).resolves.toBe(0);
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).not.toHaveBeenCalled();
  });

  test("runs once and reports the dead-lettered count when a row failed", async () => {
    await expect(sweepExhaustedQueueContacts(executor, "10", 2)).resolves.toBe(3);
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).toHaveBeenCalledTimes(1);
  });

  // The campaign id crosses into an RPC that takes a number; a stringified id
  // would silently sweep campaign 0.
  test("passes the campaign id through as a number", async () => {
    await sweepExhaustedQueueContacts(executor, "42", 1);
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).toHaveBeenCalledWith(
      executor,
      42,
    );
  });
});
