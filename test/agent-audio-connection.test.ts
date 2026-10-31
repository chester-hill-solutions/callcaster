import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentAudioConnection } from "@/lib/agent-audio-connection";
import { agentAudioStorageKey, type AgentAudioStorage } from "@/lib/agent-audio-storage";
import type { VoiceAudioConnectRequest } from "@/lib/voice-audio-client";

const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "agent-audio" };
const first: VoiceAudioConnectRequest = { workspaceId: owner.workspaceId, phoneNumber: "+16135550123", connection_intent_id: "20000000-0000-4000-8000-000000000001" };
const next: VoiceAudioConnectRequest = { ...first, phoneNumber: "+16135550124", connection_intent_id: "20000000-0000-4000-8000-000000000002" };
const sid = `CA${"1".repeat(32)}`;

function snapshot(request = first, connection_state = "joining") {
  return { connection_id: request.connection_intent_id.replace("20000000", "30000000"), connection_state, workspace_id: owner.workspaceId,
    user_id: owner.userId, connection_intent_id: request.connection_intent_id, control_intent_id: request.connection_intent_id,
    destination: request.phoneNumber, transport: "phone", generation: request === next ? 2 : 1, callSid: sid,
    requested_call_sid: null, source_agent_sid: null, campaign_id: null, cancel_requested: false };
}
function intent(request = first, state = "joining") {
  return { workspace_id: owner.workspaceId, user_id: owner.userId, connection_intent_id: request.connection_intent_id, intent_state: "bound",
    request: { transport: "phone", destination: request.phoneNumber, callSid: null, expectedAgentSid: null, campaignId: null }, connection: snapshot(request, state) };
}
function memoryStorage(): AgentAudioStorage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("agent audio request owner", () => {
  let storage: AgentAudioStorage, resource: AgentAudioConnection, close: () => void;
  beforeEach(() => {
    vi.useFakeTimers(); storage = memoryStorage(); resource = new AgentAudioConnection(owner, storage); close = resource.mount();
  });
  afterEach(() => { close(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  test("keeps computer audio through accepted, ready and failed phone responses", async () => {
    let state = "joining";
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => Response.json(options.method === "POST" ? { success: true, ...snapshot() } : intent(first, state)));
    vi.stubGlobal("fetch", fetcher);
    await resource.begin(first);
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", pendingDevice: first.phoneNumber, active: null });
    state = "ready"; await resource.refresh(); expect(resource.getSnapshot().selectedDevice).toBe("computer");
    state = "failed"; await resource.refresh(); expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", active: null, pendingDevice: null });
  });
  test("changes the effective device only after a checked active receipt", async () => {
    let state = "joining";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => Response.json(options.method === "POST" ? { success: true, ...snapshot() } : intent(first, state))));
    await resource.begin(first); expect(resource.getSnapshot().selectedDevice).toBe("computer");
    state = "active"; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, active: { callSid: sid, connection_state: "active" }, pendingDevice: null });
  });
  test("a checked read recovers a lost POST reply and clears the uncertainty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") throw new TypeError("lost reply");
      return Response.json(intent(first, "active"));
    }));
    await resource.begin(first);
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, pendingDevice: null, error: null });
  });
  test("a poll for the old working phone cannot erase its pending replacement", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      const request = options.method === "POST" ? JSON.parse(String(options.body)) : new URL(url, "https://app.test").searchParams.get("connection_intent_id") === next.connection_intent_id ? next : first;
      const isNext = request.connection_intent_id === next.connection_intent_id;
      return Response.json(options.method === "POST" ? { success: true, ...snapshot(isNext ? next : first, isNext ? "joining" : "active") } : intent(isNext ? next : first, isNext ? "joining" : "active"));
    }));
    await resource.begin(first); await resource.begin(next); await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, active: { connection_state: "active" }, pendingDevice: next.phoneNumber });
  });
  test("retry retains the complete request and cannot send a second in-flight POST", async () => {
    const acknowledgement = deferred<Response>();
    let postsSent = 0;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => options.method === "POST" ? ++postsSent === 1 ? acknowledgement.promise : Response.json({ error: "Unknown" }, { status: 502 }) : Response.json({ error: "Not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const sending = resource.begin(first); await resource.retry();
    expect(fetcher.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(1);
    acknowledgement.resolve(Response.json({ error: "Unknown" }, { status: 502 })); await sending;
    await resource.retry();
    const posts = fetcher.mock.calls.filter(call => call[1].method === "POST");
    expect(posts).toHaveLength(2); expect(posts[0][1].body).toBe(posts[1][1].body);
    expect(JSON.parse(String(posts[1][1].body))).toEqual(first);
  });
  test("cancel before a late active response keeps computer audio and a newer request", async () => {
    const oldReply = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === "POST") return JSON.parse(String(options.body)).connection_intent_id === first.connection_intent_id ? oldReply.promise : Response.json({ success: true, ...snapshot(next) });
      const id = new URL(url, "https://app.test").searchParams.get("connection_intent_id");
      if (options.method === "DELETE") return Response.json({ ...intent(), intent_state: "canceled", request: null, connection: null });
      return Response.json(id === next.connection_intent_id ? intent(next) : intent());
    }));
    const old = resource.begin(first); expect(await resource.cancel()).toBe(true);
    await resource.begin(next); oldReply.resolve(Response.json({ success: true, ...snapshot(first, "active") })); await old;
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", pendingDevice: next.phoneNumber, active: null });
  });
  test("a lost cancel reply stays canceling and cannot adopt an earlier active read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") return Response.json({ success: true, ...snapshot() });
      if (options.method === "DELETE") throw new TypeError("lost cancel reply");
      return Response.json(intent(first, "active"));
    }));
    // Hold the first read in joining before requesting cancellation.
    const fetcher = vi.mocked(fetch); fetcher.mockResolvedValueOnce(Response.json({ success: true, ...snapshot() })).mockResolvedValueOnce(Response.json(intent()));
    await resource.begin(first); await resource.cancel(); await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", cancelRequested: true, pendingDevice: first.phoneNumber, active: null });
  });
  test("a late positive POST cannot commit audio after an unconfirmed Cancel", async () => {
    const reply = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") return reply.promise;
      throw new TypeError("lost cancellation reply");
    }));
    const sending = resource.begin(first); await resource.cancel();
    reply.resolve(Response.json({ success: true, ...snapshot(first, "active") })); await sending;
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", active: null, pendingDevice: first.phoneNumber, cancelRequested: true });
  });
  test("route remount recovers the saved request with GET and does not ring again", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => Response.json(options.method === "POST" ? { success: true, ...snapshot() } : intent())));
    await resource.begin(first); close();
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(intent(first, "active"))); vi.stubGlobal("fetch", fetcher);
    resource = new AgentAudioConnection(owner, storage); close = resource.mount();
    await vi.advanceTimersByTimeAsync(1);
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, pendingDevice: null });
    expect(fetcher.mock.calls.length).toBeGreaterThan(0);
    expect(fetcher.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });
  test("a disposed lifetime cannot publish a late active result", async () => {
    const reply = deferred<Response>(), changed = vi.fn(); resource.subscribe(changed);
    vi.stubGlobal("fetch", vi.fn(() => reply.promise));
    const sending = resource.begin(first); close(); const before = changed.mock.calls.length;
    reply.resolve(Response.json({ success: true, ...snapshot(first, "active") })); await sending;
    expect(changed).toHaveBeenCalledTimes(before); expect(resource.getSnapshot().selectedDevice).toBe("computer");
  });
  test("returning to computer keeps the phone until browser readiness and confirmed cancellation", async () => {
    let stopped = false;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") return Response.json({ success: true, ...snapshot(first, "active") });
      if (options.method === "DELETE") return Response.json({ ...intent(first, stopped ? "canceled" : "active"), intent_state: "canceled",
        connection: { ...snapshot(first, stopped ? "canceled" : "active"), cancel_requested: true } });
      return Response.json(intent(first, "active"));
    });
    vi.stubGlobal("fetch", fetcher);
    await resource.begin(first); resource.prepareBrowser();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, preparingBrowser: true });
    expect(fetcher.mock.calls.filter(call => call[1].method === "DELETE")).toHaveLength(0);
    await resource.browserReady();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, pendingDevice: "computer", cancelRequested: true });
    stopped = true; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", active: null, pendingDevice: null });
  });
  test("canceling browser preparation leaves the working phone and sends no stop", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => Response.json(options.method === "POST" ? { success: true, ...snapshot(first, "active") } : intent(first, "active")));
    vi.stubGlobal("fetch", fetcher);
    await resource.begin(first); resource.prepareBrowser(); resource.cancelBrowserPreparation(); await resource.browserReady();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: first.phoneNumber, preparingBrowser: false });
    expect(fetcher.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
  });
  test("storage failure stops before POST and keeps the current audio", async () => {
    close(); resource = new AgentAudioConnection(owner, { getItem: () => null, setItem: () => { throw new Error("storage blocked"); } }); close = resource.mount();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await resource.begin(first)).toBe(false); expect(fetcher).not.toHaveBeenCalled();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: "computer", active: null, pendingDevice: null });
  });
  test("Retry reads storage again after a temporary browser read failure without sending a call", async () => {
    close(); let blocked = true;
    resource = new AgentAudioConnection(owner, { getItem: () => { if (blocked) throw new Error("storage blocked"); return null; }, setItem: () => {} });
    close = resource.mount(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(resource.getSnapshot().restoring).toBe(true);
    blocked = false; await resource.retry();
    expect(resource.getSnapshot()).toMatchObject({ restoring: false, selectedDevice: "computer", error: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
