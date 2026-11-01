import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stopDialerRequest } from "@/lib/voice-dialer-stop-client";
import type { DialerJournal } from "@/lib/predictive-dialer-journal";

const journal: DialerJournal = { version: 1, workspaceId: "10000000-0000-4000-8000-000000000001", userId: "captured-agent", campaignId: "42",
  intentId: "20000000-0000-4000-8000-000000000001", conference: "captured-room", state: "stopping", request: null };
const snapshot = { success: true, workspace_id: journal.workspaceId, user_id: journal.userId, campaign_id: 42,
  intent_id: journal.intentId, conference_id: journal.conference, stop_state: "stopped" };
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("captured Stop response contract", () => {
  test.each([[200, "stopped"], [202, "pending"]])("accepts only the owned HTTP %i %s response", async (status, stop_state) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...snapshot, stop_state }, { status: Number(status) }));
    expect(await stopDialerRequest(journal)).toMatchObject({ stop_state });
  });
  test.each([
    { workspace_id: "10000000-0000-4000-8000-000000000002" }, { user_id: "next-actor" }, { campaign_id: 43 },
    { intent_id: "20000000-0000-4000-8000-000000000002" }, { conference_id: "next-room" },
    { conference_id: null }, { success: false }, { error: "still active" }, { stop_state: "active" },
  ])("refuses a changed or malformed receipt: %j", async patch => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...snapshot, ...patch }));
    expect(await stopDialerRequest(journal)).toBeNull();
  });
  test.each([[202, "stopped"], [200, "pending"], [500, "stopped"]])("HTTP %i cannot acknowledge %s", async (status, stop_state) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...snapshot, stop_state }, { status: Number(status) }));
    expect(await stopDialerRequest(journal)).toBeNull();
  });
  test("a bounded wait retains uncertainty and permits the same Stop retry", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
    })).mockResolvedValueOnce(Response.json(snapshot));
    const pending = stopDialerRequest(journal);
    await vi.advanceTimersByTimeAsync(15_000); expect(await pending).toBeNull();
    expect(await stopDialerRequest(journal)).toEqual(snapshot);
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(vi.mocked(fetch).mock.calls[0][1]?.body);
    expect(vi.getTimerCount()).toBe(0);
  });
});
