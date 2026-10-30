import { afterEach, describe, expect, test, vi } from "vitest";
import { cancelVoiceAudioIntent, readVoiceAudioIntent } from "@/lib/voice-audio-intent-client";

const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "agent-audio" };
const request = { workspaceId: owner.workspaceId, phoneNumber: "+16135550123", connection_intent_id: "20000000-0000-4000-8000-000000000001" };
const connection = { connection_id: "30000000-0000-4000-8000-000000000001", connection_state: "joining", workspace_id: owner.workspaceId,
  user_id: owner.userId, connection_intent_id: "40000000-0000-4000-8000-000000000001", control_intent_id: request.connection_intent_id,
  destination: request.phoneNumber, requested_call_sid: null, campaign_id: null, callSid: `CA${"1".repeat(32)}`, source_agent_sid: null,
  generation: 1, transport: "phone", cancel_requested: false };
const bound = { workspace_id: owner.workspaceId, user_id: owner.userId, connection_intent_id: request.connection_intent_id,
  intent_state: "bound", request: { transport: "phone", destination: request.phoneNumber, callSid: null, expectedAgentSid: null, campaignId: null }, connection };
function reply(body: unknown = bound, status = 200) {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(body, { status })); vi.stubGlobal("fetch", fetcher); return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe("submitted agent audio request client", () => {
  test.each(["GET", "DELETE"] as const)("%s retains the submitted intent without a POST or a connection ID", async (method) => {
    const fetcher = reply(), invoke = method === "GET" ? readVoiceAudioIntent : cancelVoiceAudioIntent;
    expect(await invoke(owner, request)).toEqual({ ok: true, intent: bound });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/connect-phone-device?workspaceId=${owner.workspaceId}&connection_intent_id=${request.connection_intent_id}`,
      expect.objectContaining({ method, cache: "no-store", credentials: "same-origin", redirect: "error" }));
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ "X-Callcaster-Audio-Actor": owner.userId });
  });
  test("accepts a cancellation saved before admission without inventing a connection", async () => {
    const canceled = { ...bound, intent_state: "canceled", request: null, connection: null }; reply(canceled);
    expect(await cancelVoiceAudioIntent(owner, request)).toEqual({ ok: true, intent: canceled });
  });
  test("a superseded request has no effective connection to adopt or stop", async () => {
    const superseded = { ...bound, intent_state: "superseded", connection: null }; reply(superseded);
    expect(await readVoiceAudioIntent(owner, request)).toEqual({ ok: true, intent: superseded });
  });
  test.each([
    { user_id: "other-agent" }, { workspace_id: "10000000-0000-4000-8000-000000000002" },
    { user_id: "other-agent", connection: { ...connection, user_id: "other-agent" } },
    { workspace_id: "10000000-0000-4000-8000-000000000002", connection: { ...connection, workspace_id: "10000000-0000-4000-8000-000000000002" } },
    { connection_intent_id: "90000000-0000-4000-8000-000000000001" }, { request: { ...bound.request, destination: "+16135550124" } },
    { request: { ...bound.request, callSid: `CA${"2".repeat(32)}` } }, { request: { ...bound.request, campaignId: 42 } },
    { connection: { ...connection, control_intent_id: connection.connection_intent_id } },
    { connection: { ...connection, user_id: "other-agent" } }, { connection: null }, { request: null },
    { intent_state: "superseded" }, { intent_state: "canceled" }, { error: "ambiguous reply" },
  ])("rejects wrong scope, request or control ownership %j", async (changed) => {
    reply({ ...bound, ...changed });
    expect(await readVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "unverified", status: 200 });
    expect(await cancelVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test("a non-success reply cannot activate or confirm cancellation", async () => {
    reply(bound, 409);
    expect(await readVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "refused", status: 409 });
    expect(await cancelVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "refused", status: 409 });
  });
  test("a lost read or cancel reply sends no follow-up provider create", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("lost reply")); vi.stubGlobal("fetch", fetcher);
    expect(await readVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "unavailable", status: null });
    expect(await cancelVoiceAudioIntent(owner, request)).toEqual({ ok: false, kind: "unavailable", status: null });
    expect(fetcher.mock.calls.map(args => args[1].method)).toEqual(["GET", "DELETE"]);
  });
});
