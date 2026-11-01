import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PredictiveDialer } from "@/lib/predictive-dialer";
import { dialerJournalKey, readDialerJournal, writeDialerJournal, type DialerJournal } from "@/lib/predictive-dialer-journal";
import { memoryStorage } from "./helpers/voice-audio-current-fixture";

const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "saved-start-agent", campaignId: "42" };
const request = { workspace_id: owner.workspaceId, campaign_id: owner.campaignId, caller_id: "+16135550101", selected_device: "computer" };
const intentId = "20000000-0000-4000-8000-000000000001", room = "saved-dialer-room";
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const accepted = () => Response.json({ success: true, conferenceName: room });
function stopped(body: string, stop_state = "stopped") {
  const value = JSON.parse(body);
  return Response.json({ success: true, workspace_id: value.workspaceId, user_id: owner.userId, campaign_id: Number(value.campaignId),
    intent_id: value.dial_intent_id, conference_id: value.conferenceName ?? null, stop_state }, { status: stop_state === "stopped" ? 200 : 202 });
}
const calls = () => vi.mocked(fetch).mock.calls;
const body = (index: number) => JSON.parse(String(calls()[index]?.[1]?.body));
const saved = (state: DialerJournal["state"] = "starting"): DialerJournal => ({ version: 1, ...owner, intentId,
  conference: state === "active" ? room : null, state, request: { ...request, actor_id: owner.userId, dial_intent_id: intentId } });
const disposals: Array<() => void> = [];
function mounted(storage = memoryStorage(), scope = owner, verified = true) {
  const dialer = new PredictiveDialer(scope, storage); disposals.push(dialer.mount()); if (verified) dialer.recover(null); return dialer;
}
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("saved Start and captured Stop ownership", () => {
  test("an empty journal cannot acknowledge Leave while discovery is pending", async () => {
    const dialer = mounted(memoryStorage(), owner, false);
    expect(await dialer.stop()).toBe(false); expect(fetch).not.toHaveBeenCalled();
    dialer.recover(null); expect(await dialer.stop()).toBe(true);
  });
  test("a failed current read revokes earlier idle proof", async () => {
    const dialer = mounted();
    expect(await dialer.stop()).toBe(true);
    dialer.recover(null, false); expect(await dialer.stop()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("an active current control rejected by a local fence cannot prove no-op Stop", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage);
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body)));
    expect(await dialer.stop()).toBe(true);
    dialer.recover({ workspace_id: owner.workspaceId, user_id: owner.userId, campaign_id: 42,
      intent_id: "20000000-0000-4000-8000-000000000002", conference_id: "another-room", dialer_state: "active" });
    expect(await dialer.stop()).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("a captured session still permits Stop when current discovery fails", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage); dialer.recover(null, false);
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body)));
    expect(await dialer.stop()).toBe(true); expect(body(0).dial_intent_id).toBe(intentId);
  });
  test("a successful credit retry and Stop retire the refused nonce before the next session", async () => {
    const dialer = mounted();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ creditsError: true }, { status: 402 })).mockResolvedValueOnce(accepted())
      .mockImplementationOnce(async (_url, init) => stopped(String(init?.body))).mockResolvedValueOnce(accepted());
    await dialer.begin(request, null); const id = body(0).dial_intent_id;
    await dialer.begin(request, null); expect(body(1).dial_intent_id).toBe(id);
    expect(await dialer.stop()).toBe(true); await dialer.begin(request, null);
    expect(body(3).dial_intent_id).not.toBe(id);
  });
  test("an already pending Stop keeps its fetch alive through unmount", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage), reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const pending = dialer.stop(); disposals.pop()?.();
    try { expect(calls()[0][1]?.keepalive).toBe(true); }
    finally { reply.resolve(stopped(String(calls()[0][1]?.body))); }
    await pending;
    expect(readDialerJournal(storage, owner)).toBeNull();
  });
  test("journals the whole request before its first POST and sends the captured actor", async () => {
    const storage = memoryStorage(), dialer = mounted(storage);
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      const journal = readDialerJournal(storage, owner); expect(journal?.state).toBe("starting");
      expect(journal?.request).toMatchObject(request); expect(journal?.intentId).toBe(JSON.parse(String(init?.body)).dial_intent_id);
      expect(init?.headers).toMatchObject({ "X-Callcaster-Audio-Actor": owner.userId }); return accepted();
    });
    await dialer.begin(request, null); expect(readDialerJournal(storage, owner)).toMatchObject({ state: "active", conference: room });
    expect(dialer.getSnapshot().conference).toBe(room);
  });
  test("a reload does not POST Start, and Check reuses its original nonce and source", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved(), null);
    const dialer = mounted(storage); expect(fetch).not.toHaveBeenCalled();
    expect(dialer.getSnapshot()).toMatchObject({ awaitingReceipt: true, pendingStartIntentId: intentId });
    dialer.recover(null); expect(dialer.getSnapshot().pendingStartIntentId).toBe(intentId);
    vi.mocked(fetch).mockResolvedValueOnce(accepted());
    await dialer.begin({ ...request, caller_id: "+16135550999", selected_device: "+16135550222" }, null);
    expect(body(0)).toEqual({ caller_id: request.caller_id, selected_device: "computer", dial_intent_id: intentId });
  });
  test("Stop cancels an in-flight Start before its reply and a late reply cannot revive it", async () => {
    const reply = deferred(), storage = memoryStorage(), dialer = mounted(storage);
    vi.mocked(fetch).mockReturnValueOnce(reply.promise).mockImplementationOnce(async (_url, init) => stopped(String(init?.body)));
    const start = dialer.begin(request, null); const id = body(0).dial_intent_id;
    expect(await dialer.stop()).toBe(true);
    expect(body(1)).toEqual({ workspaceId: owner.workspaceId, campaignId: "42", dial_intent_id: id });
    expect(readDialerJournal(storage, owner)).toBeNull();
    reply.resolve(accepted()); await start;
    expect(dialer.getSnapshot()).toMatchObject({ conference: null, isLoading: false, stopPending: false });
    expect(calls().map(([url]) => url)).not.toContain("/api/hangup");
  });
  test("202 retains Stop and its exact target despite a room-ended event, then only 200 clears it", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage);
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => stopped(String(init?.body), "pending"))
      .mockImplementationOnce(async (_url, init) => stopped(String(init?.body)));
    expect(await dialer.stop()).toBe(false); dialer.setConference(null); await dialer.begin(request, null);
    expect(fetch).toHaveBeenCalledTimes(1); expect(dialer.getSnapshot().stopPending).toBe(true);
    expect(readDialerJournal(storage, owner)?.state).toBe("stopping");
    expect(await dialer.stop()).toBe(true); expect(body(1)).toEqual(body(0)); expect(dialer.getSnapshot().stopPending).toBe(false);
  });
  test("a new explicit Start waits for Stop, rotates nonce, and rejects the old late reply", async () => {
    const old = deferred(), next = deferred(), dialer = mounted();
    vi.mocked(fetch).mockReturnValueOnce(old.promise).mockImplementationOnce(async (_url, init) => stopped(String(init?.body))).mockReturnValueOnce(next.promise);
    const previous = dialer.begin(request, null), oldId = body(0).dial_intent_id;
    expect(await dialer.stop()).toBe(true); const successor = dialer.begin(request, null);
    const newId = body(2).dial_intent_id; expect(newId).not.toBe(oldId);
    old.resolve(accepted()); await previous;
    expect(dialer.getSnapshot()).toMatchObject({ conference: null, isLoading: true, pendingStartIntentId: newId });
    next.resolve(Response.json({ success: true, conferenceName: "next-room" })); await successor;
    expect(dialer.getSnapshot().conference).toBe("next-room");
  });
  test("a saved Stop reload retries only Stop and never sends another customer", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("stopping"), null);
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body)));
    const dialer = mounted(storage); await vi.waitFor(() => expect(dialer.getSnapshot().stopPending).toBe(false));
    expect(calls().map(([url]) => url)).toEqual(["/api/auto-dial/end"]); expect(body(0).dial_intent_id).toBe(intentId);
  });
  test("a different campaign resolves the original saved session before a new Start", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved(), null);
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body), "pending"));
    const dialer = mounted(storage, { ...owner, campaignId: "43" }); await dialer.begin({ ...request, campaign_id: "43" }, null);
    expect(calls().map(([url]) => url)).toEqual(["/api/auto-dial/end"]); expect(body(0).campaignId).toBe("42");
    expect(dialer.getSnapshot()).toMatchObject({ conference: null, stopPending: true });
  });
  test("current discovery recovers an idle room without a journal or a Start POST", async () => {
    const dialer = mounted(); dialer.recover({ workspace_id: owner.workspaceId, user_id: owner.userId, campaign_id: 42,
      intent_id: intentId, conference_id: room, dialer_state: "active" });
    expect(fetch).not.toHaveBeenCalled(); expect(dialer.getSnapshot().conference).toBe(room);
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body)));
    expect(await dialer.stop()).toBe(true); expect(body(0)).toMatchObject({ dial_intent_id: intentId, conferenceName: room });
  });
  test.each(["read", "write", "invalid"])("unavailable %s storage blocks a fresh Start", async mode => {
    const storage = memoryStorage();
    if (mode === "read") storage.getItem = () => { throw new Error("blocked"); };
    else if (mode === "write") storage.setItem = () => { throw new Error("blocked"); };
    else storage.setItem(dialerJournalKey(owner), "invalid JSON");
    const dialer = mounted(storage); await dialer.begin(request, null);
    expect(fetch).not.toHaveBeenCalled(); expect(dialer.getSnapshot().error).toMatch(/saved dialer request/);
  });
  test("a server-owned Stop remains usable with blocked storage", async () => {
    const storage = memoryStorage(); storage.getItem = () => { throw new Error("blocked"); };
    const dialer = mounted(storage); dialer.recover({ workspace_id: owner.workspaceId, user_id: owner.userId, campaign_id: 42,
      intent_id: intentId, conference_id: room, dialer_state: "active" });
    vi.mocked(fetch).mockImplementation(async (_url, init) => stopped(String(init?.body)));
    expect(await dialer.stop()).toBe(true); expect(calls()).toHaveLength(1);
  });
  test("unmount journals Stop before a keepalive POST and never hangs up an arbitrary SDK Call", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage); const reply = deferred();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      expect(readDialerJournal(storage, owner)?.state).toBe("stopping"); expect(init?.keepalive).toBe(true); return reply.promise;
    });
    disposals.pop()?.(); expect(calls().map(([url]) => url)).toEqual(["/api/auto-dial/end"]);
    reply.resolve(stopped(String(calls()[0][1]?.body))); await vi.waitFor(() => expect(readDialerJournal(storage, owner)).toBeNull());
    expect(dialer.getSnapshot().conference).toBe(room);
  });
  test("an old cleanup reply cannot clear a newer tab's saved request", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage), reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    const ending = dialer.stop();
    storage.setItem(dialerJournalKey(owner), JSON.stringify({ ...saved(), intentId: "20000000-0000-4000-8000-000000000002",
      request: { ...saved().request, dial_intent_id: "20000000-0000-4000-8000-000000000002" } }));
    reply.resolve(stopped(String(calls()[0][1]?.body))); await ending;
    expect(readDialerJournal(storage, owner)?.intentId).toBe("20000000-0000-4000-8000-000000000002");
    await dialer.begin(request, null); expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("a committed remount observes an already pending exact Stop reply", async () => {
    const storage = memoryStorage(); writeDialerJournal(storage, owner, saved("active"), null);
    const dialer = mounted(storage), reply = deferred(); vi.mocked(fetch).mockReturnValueOnce(reply.promise);
    disposals.pop()?.(); disposals.push(dialer.mount());
    reply.resolve(stopped(String(calls()[0][1]?.body)));
    await vi.waitFor(() => expect(dialer.getSnapshot()).toMatchObject({ conference: null, stopPending: false, isStopping: false }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
