import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { advanceQueueEntry } from "@/lib/queue-advance-client";

const request = { workspace_id: "10000000-0000-4000-8000-000000000001", campaign_id: 42, contact_id: 7, queue_id: 27,
  dispatch_generation: "10000000-0000-4000-8000-000000000099", voice_reservation_id: null, household: false,
  call_sid: "CA33333333333333333333333333333333" };
const actor = "10000000-0000-4000-8000-000000000002";
const ack = { workspace_id: "10000000-0000-4000-8000-000000000001", campaign_id: 42, contact_id: 7, queue_id: 27,
  dispatch_generation: "10000000-0000-4000-8000-000000000099", voice_reservation_id: null, household: false,
  call_sid: "CA33333333333333333333333333333333", user_id: actor, success: true, dequeued: true, advance_state: "dequeued" };
const removed = [{ queue_id: 27, contact_id: 7, dispatch_generation: "10000000-0000-4000-8000-000000000099", voice_reservation_id: null }];
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("captured queue advance acknowledgement", () => {
  test.each(["dequeued", "already_dequeued", "superseded"])("only a matching acknowledgement permits advance: %s", async advance_state => {
    fetcher.mockResolvedValue(Response.json({ ...ack, dequeued: advance_state === "dequeued", advance_state, removed_entries: advance_state === "superseded" ? [] : removed }));
    expect(await advanceQueueEntry(request, actor)).toEqual({ ok: true, advanceState: advance_state, removedEntries: advance_state === "superseded" ? [] : removed });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/queues", expect.objectContaining({ method: "POST", credentials: "same-origin",
      redirect: "error", headers: expect.objectContaining({ "X-Callcaster-Audio-Actor": actor }) }));
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(request);
  });
  test.each([
    { workspace_id: "20000000-0000-4000-8000-000000000001" }, { user_id: "another-agent" }, { campaign_id: 43 },
    { contact_id: 8 }, { queue_id: 28 }, { dispatch_generation: "20000000-0000-4000-8000-000000000099" },
    { household: true }, { voice_reservation_id: "20000000-0000-4000-8000-000000000077" },
    { removed_entries: [] }, { removed_entries: [{ ...removed[0], queue_id: 28 }] }, { call_sid: "CA44444444444444444444444444444444" },
    { success: false }, { dequeued: undefined }, { advance_state: "pending" }, { advance_state: "superseded" },
  ])("refuses mismatched acknowledgement %j", async patch => {
    fetcher.mockResolvedValue(Response.json({ ...ack, removed_entries: removed, ...patch }));
    expect(await advanceQueueEntry(request, actor)).toMatchObject({ ok: false });
  });
  test.each([202, 400, 401, 403, 409, 500])("HTTP %s cannot confirm advance even with a matching body", async status => {
    fetcher.mockResolvedValue(Response.json(ack, { status }));
    expect(await advanceQueueEntry(request, actor)).toMatchObject({ ok: false });
  });
  test("lost replies keep the contact retryable", async () => {
    fetcher.mockRejectedValueOnce(new TypeError("Owned lost queue reply"));
    expect(await advanceQueueEntry(request, actor)).toMatchObject({ ok: false });
    fetcher.mockResolvedValueOnce(Response.json({ ...ack, dequeued: false, advance_state: "already_dequeued", removed_entries: removed }));
    expect(await advanceQueueEntry(request, actor)).toEqual({ ok: true, advanceState: "already_dequeued", removedEntries: removed });
  });
  test("an invalid queue snapshot sends no request", async () => {
    expect(await advanceQueueEntry({ ...request, dispatch_generation: "" }, actor)).toMatchObject({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
