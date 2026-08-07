import { describe, expect, test, vi } from "vitest";
import { rpcClaimQueueEntryForDial } from "../app/lib/db-rpc.server";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

/** Extract the literal SQL text from a drizzle SQL object's queryChunks. */
function sqlText(query: SQL): string {
  const chunks = (query as unknown as { queryChunks: Array<{ constructor: { name: string }; value: unknown }> }).queryChunks;
  return chunks
    .filter((c) => c.constructor.name === "StringChunk")
    .map((c) => String(c.value))
    .join("");
}

describe("rpcClaimQueueEntryForDial", () => {
  test("calls claim_queue_entry_for_dial with the given ids and returns the scalar result", async () => {
    const execute = vi.fn(async (_query: SQL) => [{ result: "claimed" }]);
    const result = await rpcClaimQueueEntryForDial(
      { execute },
      { queueId: 3, campaignId: 1, workspaceId: "w1", userId: "u1" },
    );
    expect(result).toBe("claimed");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sqlText(execute.mock.calls[0][0])).toContain("claim_queue_entry_for_dial");
  });

  test.each(["unavailable", "claimed_by_other", "not_queued", "active_call"])(
    "passes through the %s refusal code",
    async (code) => {
      const execute = vi.fn(async () => [{ result: code }]);
      const result = await rpcClaimQueueEntryForDial(
        { execute },
        { queueId: 1, campaignId: 1, workspaceId: "w1", userId: "u1" },
      );
      expect(result).toBe(code);
    },
  );

  test("defaults to 'unavailable' when the function returns no row", async () => {
    const execute = vi.fn(async () => []);
    const result = await rpcClaimQueueEntryForDial(
      { execute },
      { queueId: 1, campaignId: 1, workspaceId: "w1", userId: "u1" },
    );
    expect(result).toBe("unavailable");
  });
});
