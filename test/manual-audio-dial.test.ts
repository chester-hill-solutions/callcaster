import { afterEach, describe, expect, test, vi } from "vitest";
import { ManualAudioDial } from "@/lib/manual-audio-dial.client";
import type { StartCallArgs } from "@/lib/manual-dial-client";

const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "agent", campaignId: 1 };
function request(acceptCustomer = vi.fn(() => true)): StartCallArgs {
  return { contact: { id: 2, phone: "+16135550123" }, campaign: { id: 1, caller_id: "+16135550124" },
    nextRecipient: { id: 3, dispatch_generation: "40000000-0000-4000-8000-000000000001" }, recentAttempt: null,
    workspaceId: owner.workspaceId, user: { id: owner.userId }, selectedDevice: "+16135550125",
    audioSource: { connectionId: "30000000-0000-4000-8000-000000000001", generation: 4 }, acceptCustomer } as StartCallArgs;
}
function fixture() {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const resource = new ManualAudioDial(owner, storage), close = resource.mount();
  return { storage, resource, close };
}
const root = `CA${"2".repeat(32)}`;
afterEach(() => vi.unstubAllGlobals());

describe("manual customer request over confirmed phone audio", () => {
  test("binds the returned customer root and submits the checked phone generation", async () => {
    const fetcher = vi.fn(async () => Response.json({ success: true, callSid: root })); vi.stubGlobal("fetch", fetcher);
    const { resource, close } = fixture(), accept = vi.fn(() => true);
    await resource.begin(request(accept));
    expect(accept).toHaveBeenCalledExactlyOnceWith(root);
    expect(resource.getSnapshot()).toEqual({ pending: false, sending: false, error: null });
    const fields = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fields).toMatchObject({ audio_connection_id: "30000000-0000-4000-8000-000000000001", audio_generation: "4", selected_device: "+16135550125",
      queue_id: "3", expected_queue_generation: "40000000-0000-4000-8000-000000000001" });
    close();
  });
  test("an unknown reply retains the exact full request for retry and blocks a different contact", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("lost reply")).mockImplementation(async () => Response.json({ success: true, callSid: root }));
    vi.stubGlobal("fetch", fetcher);
    const { resource, close } = fixture(), accept = vi.fn(() => true);
    await resource.begin(request(accept));
    expect(resource.getSnapshot()).toMatchObject({ pending: true, sending: false });
    await resource.begin({ ...request(), contact: { ...request().contact, id: 99 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await resource.retry();
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(accept).toHaveBeenCalledExactlyOnceWith(root); close();
  });
  test.each([{ success: false, callSid: root }, { success: true, callSid: "CA-invalid" }, { success: true, callSid: root, error: "refused" }])(
    "never binds a malformed or negative receipt %#", async body => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
      const { resource, close } = fixture(), accept = vi.fn(() => true);
      await resource.begin(request(accept)); expect(accept).not.toHaveBeenCalled();
      expect(resource.getSnapshot().pending).toBe(true); close();
    });
  test("reload restores an uncertain request without sending and explicit retry reuses it", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("lost reply")).mockImplementation(async () => Response.json({ success: true, callSid: root })); vi.stubGlobal("fetch", fetcher);
    const { resource, storage, close } = fixture(); await resource.begin(request()); close();
    const restored = new ManualAudioDial(owner, storage), dispose = restored.mount(), accept = vi.fn(() => true);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(restored.getSnapshot().pending).toBe(true);
    await restored.retry(() => accept);
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(accept).toHaveBeenCalledExactlyOnceWith(root); dispose();
  });
  test("a disposed request cannot bind a customer after its reply arrives", async () => {
    let reply: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { reply = resolve; })));
    const { resource, close } = fixture(), accept = vi.fn(() => true), sending = resource.begin(request(accept)); close();
    reply(Response.json({ success: true, callSid: root })); await sending;
    expect(accept).not.toHaveBeenCalled();
  });
});
