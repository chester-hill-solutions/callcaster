import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentAudioConnection } from "@/lib/agent-audio-connection";
import { agentAudioStorageKey, type AgentAudioStorage } from "@/lib/agent-audio-storage";
import { current, firstId, firstRequest, intent, memoryStorage, nextId, nextPhone, nextRequest, owner, phone } from "./helpers/voice-audio-current-fixture";

describe("audio recovery without a trusted browser journal", () => {
  let storage: AgentAudioStorage, resource: AgentAudioConnection, dispose: (() => void) | undefined;
  beforeEach(() => { vi.useFakeTimers(); storage = memoryStorage(); });
  afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function mount(port = storage) {
    resource = new AgentAudioConnection(owner, port); dispose = resource.mount();
    await resource.refresh();
    // mount owns the first asynchronous read; wait for its observable result.
    await vi.waitFor(() => expect(resource.getSnapshot().restoring).toBe(false));
  }

  test("an empty journal restores the server's working phone without another send", async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(current(intent()))); vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" }, pendingDevice: null });
    expect(fetcher.mock.calls.length).toBeGreaterThan(0);
    expect(fetcher.mock.calls.every(call => String(call[0]).includes("current=1") && call[1]?.method === "GET")).toBe(true);
    const saved = JSON.parse(storage.getItem(agentAudioStorageKey(owner)) ?? "null");
    expect(saved.active).toEqual(firstRequest);
  });

  test("invalid local data recovers the checked server phone", async () => {
    storage.setItem(agentAudioStorageKey(owner), "{broken");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(current(intent()))));
    await mount();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" }, error: null });
  });

  test("unreadable storage does not hide a working phone or permit an unsaved send", async () => {
    const broken = { getItem: () => { throw new Error("private storage"); }, setItem: () => { throw new Error("private storage"); } };
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(current(intent()))); vi.stubGlobal("fetch", fetcher);
    await mount(broken);
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" } });
    expect(resource.getSnapshot().error).toMatch(/save|privacy/i);
    expect(await resource.begin(nextRequest)).toBe(false);
    expect(fetcher.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });

  test("restores active and pending roles without ringing the replacement", async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(current(intent(), intent(nextId, nextPhone, "joining")))); vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" }, pendingDevice: nextPhone });
    expect(fetcher.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });

  test("a recovered pending request sends only on explicit Retry with the same intent", async () => {
    const pending = intent(nextId, nextPhone, "joining");
    const fetcher = vi.fn(async (url: string, options: RequestInit) => Response.json(options.method === "POST"
      ? { success: true, ...pending.connection } : url.includes("current=1") ? current(null, pending) : pending));
    vi.stubGlobal("fetch", fetcher); await mount();
    expect(fetcher.mock.calls.some(call => call[1].method === "POST")).toBe(false);
    await resource.retry();
    const posts = fetcher.mock.calls.filter(call => call[1].method === "POST");
    expect(posts).toHaveLength(1); expect(JSON.parse(String(posts[0][1].body))).toEqual(nextRequest);
  });

  test("an unknown local request survives an empty server read and keeps its nonce", async () => {
    storage.setItem(agentAudioStorageKey(owner), JSON.stringify({ version: 1, selectedDevice: "computer", active: null,
      pending: { request: nextRequest, cancelRequested: false } }));
    const fetcher = vi.fn(async (url: string, _options: RequestInit) => url.includes("current=1") ? Response.json(current()) : Response.json({ error: "Unknown" }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher); await mount();
    expect(resource.getSnapshot()).toMatchObject({ pendingDevice: nextPhone });
    expect(JSON.parse(storage.getItem(agentAudioStorageKey(owner)) ?? "null").pending.request).toEqual(nextRequest);
    expect(fetcher.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });

  test.each(["recovery_required", "customer_pending"])("retains the server's %s admission fence", async field => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...current(), [field]: true })));
    await mount();
    expect(resource.getSnapshot()).toMatchObject(field === "recovery_required" ? { recoveryRequired: true } : { customerPending: true });
    expect(await resource.begin(firstRequest)).toBe(false);
    expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });

  test("a foreign current snapshot cannot select a phone or release the initial fence", async () => {
    const foreign = { ...current(intent()), user_id: "other-agent" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(foreign)));
    resource = new AgentAudioConnection(owner, storage); dispose = resource.mount();
    await vi.waitFor(() => expect(resource.getSnapshot().error).toBeTruthy());
    expect(resource.getSnapshot()).toMatchObject({ restoring: true, selectedDevice: "computer", active: null });
    expect(await resource.begin(firstRequest)).toBe(false);
  });

  test("a current read finishing after disposal cannot adopt audio or persist a journal", async () => {
    let reply: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { reply = resolve; })));
    resource = new AgentAudioConnection(owner, storage); dispose = resource.mount();
    expect(fetch).toHaveBeenCalledTimes(1);
    const reading = resource.refresh();
    dispose(); const before = resource.getSnapshot(); reply(Response.json(current(intent())));
    await reading;
    expect(resource.getSnapshot()).toBe(before); expect(storage.getItem(agentAudioStorageKey(owner))).toBeNull();
  });

  test("a failed current read keeps working audio but blocks another change", async () => {
    let verified = true;
    const fetcher = vi.fn(async (url: string, _options: RequestInit) => Response.json(url.includes("current=1")
      ? verified ? current(intent()) : { ...current(intent()), user_id: "other-agent" } : intent()));
    vi.stubGlobal("fetch", fetcher); await mount(); verified = false; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" }, restoring: false, currentVerified: false });
    expect(await resource.begin(nextRequest)).toBe(false); resource.prepareBrowser();
    expect(resource.getSnapshot().preparingBrowser).toBe(false);
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });

  test("a saved cancel stays with its old intent when the server has a newer control", async () => {
    storage.setItem(agentAudioStorageKey(owner), JSON.stringify({ version: 1, selectedDevice: "computer", active: null,
      pending: { request: firstRequest, cancelRequested: true } }));
    const newer = intent(nextId, phone); newer.connection.connection_intent_id = firstId;
    const fetcher = vi.fn(async (url: string, options: RequestInit) => Response.json(options.method === "DELETE"
      ? { ...intent(), intent_state: "canceled", request: null, connection: null } : url.includes("current=1") ? current(newer) : newer));
    vi.stubGlobal("fetch", fetcher); await mount(); await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { control_intent_id: nextId }, pendingDevice: null, cancelRequested: false });
    const cancellations = fetcher.mock.calls.filter(call => call[1].method === "DELETE");
    expect(cancellations).toHaveLength(1); expect(cancellations[0][0]).toContain(`connection_intent_id=${firstId}`);
    expect(JSON.parse(storage.getItem(agentAudioStorageKey(owner)) ?? "null").active.connection_intent_id).toBe(nextId);
  });

  test("browser readiness cannot cancel a newer audio owner", async () => {
    let changed = false;
    const newer = intent(nextId, phone); newer.connection.connection_intent_id = firstId;
    const fetcher = vi.fn(async (url: string, _options: RequestInit) => Response.json(url.includes("current=1")
      ? current(changed ? newer : intent()) : changed && url.includes(firstId)
        ? { ...intent(), intent_state: "superseded", connection: null } : changed ? newer : intent()));
    vi.stubGlobal("fetch", fetcher); await mount(); resource.prepareBrowser(); changed = true; await resource.refresh(); await resource.browserReady();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { control_intent_id: nextId }, preparingBrowser: false });
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });

  test("idle polling discovers an accepted phone without replaying a send", async () => {
    let connected = false;
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(current(connected ? intent() : null)));
    vi.stubGlobal("fetch", fetcher); await mount(); connected = true; await vi.advanceTimersByTimeAsync(15000);
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { connection_state: "active" } });
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });

  test("a terminal receipt cannot be revived by a later current read", async () => {
    let ended = false;
    const fetcher = vi.fn(async (url: string, _options: RequestInit) => Response.json(url.includes("current=1")
      ? current(intent()) : ended ? intent(firstId, phone, "canceled") : intent()));
    vi.stubGlobal("fetch", fetcher); await mount(); ended = true; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ active: null, currentVerified: false });
    expect(await resource.begin(nextRequest)).toBe(false);
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });

  test("a rejected pending identity cannot partly change the working audio", async () => {
    let invalid = false;
    const active = intent(), pending = intent(nextId, nextPhone, "joining");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("current=1")
      ? invalid ? { ...current({ ...active, intent_state: "canceled", connection: { ...active.connection, cancel_requested: true } },
        { ...pending, connection: { ...pending.connection, generation: 99 } }), recovery_required: true } : current(active, pending)
      : url.includes(nextId) ? pending : active)));
    await mount(); invalid = true; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ selectedDevice: phone, active: { cancel_requested: false }, pendingDevice: nextPhone, currentVerified: false });
  });

  test("an unknown saved cancel cannot transfer to a different pending intent", async () => {
    storage.setItem(agentAudioStorageKey(owner), JSON.stringify({ version: 1, selectedDevice: "computer", active: null,
      pending: { request: firstRequest, cancelRequested: true } }));
    const fetcher = vi.fn(async (url: string, options: RequestInit) => options.method === "DELETE"
      ? Response.json({ error: "Unknown cancellation" }, { status: 502 }) : Response.json(url.includes("current=1") ? current(null, intent(nextId, nextPhone, "joining")) : intent()));
    vi.stubGlobal("fetch", fetcher); await mount(); await resource.retry();
    expect(resource.getSnapshot()).toMatchObject({ pendingDevice: phone, cancelRequested: true, active: null });
    expect(JSON.parse(storage.getItem(agentAudioStorageKey(owner)) ?? "null").pending.request).toEqual(firstRequest);
    const cancellations = fetcher.mock.calls.filter(call => call[1].method === "DELETE");
    expect(cancellations.length).toBeGreaterThan(0);
    expect(cancellations.every(call => call[0].includes(`connection_intent_id=${firstId}`))).toBe(true);
    expect(fetcher.mock.calls.some(call => call[1].method === "POST")).toBe(false);
  });

  test("a finished intent cannot be sent again after a fresh idle proof", async () => {
    let ended = false, prepared = false;
    const pending = intent(nextId, nextPhone, "joining");
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === "POST") { prepared = true; return Response.json({ success: true, ...pending.connection }); }
      return Response.json(url.includes("current=1") ? current(ended ? null : intent(), prepared ? pending : null)
        : url.includes(nextId) ? pending : ended ? intent(firstId, phone, "canceled") : intent());
    });
    vi.stubGlobal("fetch", fetcher); await mount(); ended = true; await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ active: null, currentVerified: true });
    expect(await resource.begin(firstRequest)).toBe(false);
    expect(fetcher.mock.calls.some(call => call[1].method === "POST")).toBe(false);
    expect(await resource.begin(nextRequest)).toBe(true);
    expect(fetcher.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(1);
  });
});
