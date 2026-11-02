import { afterEach, describe, expect, test, vi } from "vitest";
import { currentVoiceAudioRequest, matchesCurrentVoiceAudioRequest, readCurrentVoiceAudio } from "@/lib/voice-audio-current-client";
import { current, firstId, firstRequest, intent, nextId, owner } from "./helpers/voice-audio-current-fixture";

afterEach(() => vi.unstubAllGlobals());

describe("checked current agent-audio HTTP boundary", () => {
  test("reads only the signed-in actor with credentials, no cache and no redirects", async () => {
    const body = current(intent()), fetcher = vi.fn(async () => Response.json(body)); vi.stubGlobal("fetch", fetcher);
    await expect(readCurrentVoiceAudio(owner)).resolves.toEqual(body);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/connect-phone-device?workspaceId=${owner.workspaceId}&current=1`, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "X-Callcaster-Audio-Actor": owner.userId },
    });
  });

  const invalid: [string, (active: ReturnType<typeof intent>) => unknown][] = [
    ["another top-level actor", active => ({ ...current(active), user_id: "other-agent" })],
    ["another top-level workspace", active => ({ ...current(active), workspace_id: "10000000-0000-4000-8000-000000000002" })],
    ["a complete foreign actor snapshot", active => ({ ...current({ ...active, user_id: "other-agent",
      connection: { ...active.connection, user_id: "other-agent" } }), user_id: "other-agent" })],
    ["a complete foreign workspace snapshot", active => ({ ...current({ ...active, workspace_id: "10000000-0000-4000-8000-000000000002",
      connection: { ...active.connection, workspace_id: "10000000-0000-4000-8000-000000000002" } }), workspace_id: "10000000-0000-4000-8000-000000000002" })],
    ["an error envelope", active => ({ ...current(active), error: "Failed" })],
    ["an absent recovery decision", active => ({ ...current(active), recovery_required: undefined })],
    ["another intent actor", active => current({ ...active, user_id: "other-agent" })],
    ["another connection actor", active => current({ ...active, connection: { ...active.connection, user_id: "other-agent" } })],
    ["a different control owner", active => current({ ...active, connection: { ...active.connection, control_intent_id: nextId } })],
    ["an invalid physical SID", active => current({ ...active, connection: { ...active.connection, callSid: "CA_wrong" } })],
    ["a pending state in the active role", active => current({ ...active, connection: { ...active.connection, connection_state: "joining" } })],
    ["a different requested destination", active => current({ ...active, request: { ...active.request, destination: "+16135550999" } })],
    ["a different customer root", active => current({ ...active, request: { ...active.request, callSid: `CA${"3".repeat(32)}`, expectedAgentSid: `CA${"4".repeat(32)}` } })],
    ["a different campaign", active => current({ ...active, request: { ...active.request, campaignId: 42 } })],
    ["an agent without a customer root", active => current({ ...active, request: { ...active.request, expectedAgentSid: `CA${"4".repeat(32)}` } })],
    ["active audio in the pending role", active => current(null, active)],
    ["one connection in both roles", active => current(active, { ...active, connection: { ...active.connection, connection_state: "joining" } })],
    ["canceled audio without a recovery fence", active => current({ ...active, intent_state: "canceled", connection: { ...active.connection, cancel_requested: true } })],
  ];
  test.each(invalid)("rejects %s before audio adoption", async (_name, make) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(make(intent()))));
    await expect(readCurrentVoiceAudio(owner)).resolves.toBeNull();
  });

  test.each([401, 404, 409, 429, 502])("HTTP %s cannot confirm otherwise valid current audio", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(current(intent()), { status })));
    await expect(readCurrentVoiceAudio(owner)).resolves.toBeNull();
  });
  test("invalid JSON and lost replies retain uncertainty", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("Not JSON")).mockRejectedValueOnce(new TypeError("lost reply"));
    vi.stubGlobal("fetch", fetcher);
    await expect(readCurrentVoiceAudio(owner)).resolves.toBeNull(); await expect(readCurrentVoiceAudio(owner)).resolves.toBeNull();
  });
  test("rebuilds the current control intent and keeps the older physical identity separate", () => {
    const active = intent(nextId);
    active.connection.connection_intent_id = firstId;
    expect(currentVoiceAudioRequest(owner, active)).toEqual({ ...firstRequest, connection_intent_id: nextId });
    expect(matchesCurrentVoiceAudioRequest({ ...firstRequest, connection_intent_id: nextId }, active)).toBe(true);
    expect(matchesCurrentVoiceAudioRequest(firstRequest, active)).toBe(false);
  });
  test("computer recovery retains its exact customer and original agent context", () => {
    const active = intent(), customer = `CA${"3".repeat(32)}`, agent = `CA${"4".repeat(32)}`;
    active.request = { transport: "computer", destination: null, callSid: customer, expectedAgentSid: agent, campaignId: null };
    expect(currentVoiceAudioRequest(owner, active)).toEqual({ workspaceId: owner.workspaceId, connection_intent_id: firstId,
      device: "computer", callSid: customer, expected_agent_sid: agent });
    expect(currentVoiceAudioRequest({ ...owner, userId: "other-agent" }, active)).toBeNull();
  });
});
