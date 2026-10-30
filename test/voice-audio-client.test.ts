import { afterEach, describe, expect, test, vi } from "vitest";
import { cancelVoiceAudio, connectVoiceAudio, isVoiceAudioEffective, readVoiceAudio } from "@/lib/voice-audio-client";
import { voiceAudioSnapshotSchema } from "@/lib/schemas/api/voice-audio";

const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "audio-agent" };
const request = { workspaceId: owner.workspaceId, phoneNumber: "+16135550123", connection_intent_id: "20000000-0000-4000-8000-000000000001" };
const saved = {
  connection_id: "30000000-0000-4000-8000-000000000001", connection_state: "joining" as const,
  workspace_id: owner.workspaceId, user_id: owner.userId, connection_intent_id: request.connection_intent_id,
  destination: request.phoneNumber, requested_call_sid: null, campaign_id: null, generation: 3,
  transport: "phone" as const, callSid: `CA${"1".repeat(32)}`, source_agent_sid: null, cancel_requested: false,
};

function reply(body: unknown = { success: true, ...saved }, status = 200) {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("session audio connection client", () => {
  test("posts the immutable intent and accepts a pending receipt without activating audio", async () => {
    const fetcher = reply(), result = await connectVoiceAudio(owner, request);
    expect(result).toEqual({ ok: true, connection: saved }); expect(isVoiceAudioEffective(saved)).toBe(false);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/connect-phone-device", expect.objectContaining({ method: "POST",
      credentials: "same-origin", cache: "no-store", redirect: "error" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(request);
  });
  test("a reused matching phone retains the server's original intent", async () => {
    reply({ success: true, ...saved, connection_intent_id: "40000000-0000-4000-8000-000000000001", connection_state: "active" });
    const result = await connectVoiceAudio(owner, request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected owned reused phone");
    expect(result.connection.connection_intent_id).toBe("40000000-0000-4000-8000-000000000001");
    expect(isVoiceAudioEffective(result.connection)).toBe(true);
  });
  test.each(["phone", "computer"] as const)("a live %s request retains its customer and source agent", async (device) => {
    const live = { ...request, device, phoneNumber: device === "phone" ? request.phoneNumber : undefined,
      callSid: `CA${"2".repeat(32)}`, expected_agent_sid: `CA${"3".repeat(32)}` };
    const connection = { ...saved, transport: device, destination: device === "phone" ? request.phoneNumber : `client:${owner.userId}`,
      requested_call_sid: live.callSid, source_agent_sid: live.expected_agent_sid, campaign_id: 42 };
    reply({ success: true, ...connection });
    expect(await connectVoiceAudio(owner, live)).toEqual({ ok: true, connection });
    reply({ success: true, ...connection, source_agent_sid: `CA${"4".repeat(32)}` });
    expect(await connectVoiceAudio(owner, live)).toEqual({ ok: false, kind: "unverified", status: 200 });
    reply({ success: true, ...connection, requested_call_sid: `CA${"5".repeat(32)}` });
    expect(await connectVoiceAudio(owner, live)).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test.each([
    { workspace_id: "10000000-0000-4000-8000-000000000002" }, { user_id: "another-agent" },
    { destination: "+16135550124" }, { transport: "computer", destination: "client:audio-agent" },
    { campaign_id: 42 }, { requested_call_sid: `CA${"2".repeat(32)}` },
    { connection_state: "active", callSid: null }, { success: false },
    { error: "ambiguous reply" }, { generation: 0 },
  ])("rejects an unowned, mismatched or incomplete connect response %j", async (changed) => {
    reply({ success: true, ...saved, ...changed });
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test("a non-success active snapshot is available for read/cancel but never accepted as active", async () => {
    const connection = { ...saved, connection_state: "active" as const };
    reply({ error: "Provider confirmation pending", ...connection }, 409);
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "refused", status: 409, connection });
  });
  test("an error without a receipt does not invent a connection", async () => {
    reply({ error: "Insufficient credits", creditsError: true }, 402);
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "refused", status: 402 });
  });
  test("a network failure leaves the same retry intent and sends no second request", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("lost acknowledgement"))
      .mockResolvedValueOnce(Response.json({ success: true, ...saved }));
    vi.stubGlobal("fetch", fetcher);
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "unavailable", status: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await connectVoiceAudio(owner, request)).ok).toBe(true);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });
  test("non-JSON and malformed error receipts cannot be adopted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<html>Sign in</html>")));
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "unverified", status: 200 });
    reply({ error: "Pending", connection_id: saved.connection_id }, 409);
    expect(await connectVoiceAudio(owner, request)).toEqual({ ok: false, kind: "unverified", status: 409 });
  });
  test.each(["GET", "DELETE"] as const)("%s uses the saved owner and connection, with no new create", async (method) => {
    const fetcher = reply(saved), invoke = method === "GET" ? readVoiceAudio : cancelVoiceAudio;
    expect(await invoke(owner, saved)).toEqual({ ok: true, connection: saved });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/connect-phone-device?workspaceId=${owner.workspaceId}&connection_id=${saved.connection_id}`,
      expect.objectContaining({ method }));
  });
  test.each([
    { connection_id: "30000000-0000-4000-8000-000000000002" }, { connection_intent_id: "40000000-0000-4000-8000-000000000001" },
    { workspace_id: "10000000-0000-4000-8000-000000000002" }, { user_id: "another-agent" },
    { generation: 4 }, { callSid: `CA${"2".repeat(32)}` }, { callSid: null }, { source_agent_sid: `CA${"2".repeat(32)}` },
  ])("a read cannot replace the saved physical identity %j", async (changed) => {
    reply({ ...saved, ...changed });
    expect(await readVoiceAudio(owner, saved)).toEqual({ ok: false, kind: "unverified", status: 200 });
    expect(await cancelVoiceAudio(owner, saved)).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test("a create with an unknown SID can later learn one physical SID", async () => {
    reply(saved);
    expect(await readVoiceAudio(owner, { ...saved, connection_state: "creating", callSid: null })).toEqual({ ok: true, connection: saved });
  });
  test("only a successful checked poll can confirm the prepared phone as active", async () => {
    const connection = { ...saved, connection_state: "active" as const };
    reply(connection);
    const result = await readVoiceAudio(owner, saved);
    expect(result).toEqual({ ok: true, connection });
    expect(result.ok && isVoiceAudioEffective(result.connection)).toBe(true);
  });
  test.each(["failed", "canceled", "retired"] as const)("a known %s connection cannot be revived by a later reply", async (connection_state) => {
    reply({ ...saved, connection_state: "active" });
    expect(await readVoiceAudio(owner, { ...saved, connection_state })).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test("a saved cancellation cannot disappear from a later reply", async () => {
    reply({ ...saved, connection_state: "active" });
    expect(await readVoiceAudio(owner, { ...saved, cancel_requested: true })).toEqual({ ok: false, kind: "unverified", status: 200 });
  });
  test("local owner and intent validation stop before fetch", async () => {
    const fetcher = reply();
    expect((await connectVoiceAudio(owner, { ...request, workspaceId: "bad-workspace" })).ok).toBe(false);
    expect((await connectVoiceAudio(owner, { ...request, connection_intent_id: "" })).ok).toBe(false);
    expect((await readVoiceAudio({ ...owner, userId: "other-agent" }, saved)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("ready and pending cancellation cannot replace the current audio", () => {
    expect(isVoiceAudioEffective({ ...saved, connection_state: "ready" })).toBe(false);
    expect(isVoiceAudioEffective({ ...saved, connection_state: "active", cancel_requested: true })).toBe(false);
    expect(voiceAudioSnapshotSchema.safeParse({ ...saved, connection_state: "active", callSid: null }).success).toBe(false);
  });
});
