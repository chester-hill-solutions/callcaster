import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { setJsonAuthSession, setJsonAuthUnauthorized } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), send: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  requireWorkspaceAccess: mocks.membership,
}));
vi.mock("@/server/voice-audio-connection.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-audio-connection.server")>(),
  prepareVoiceAudioConnection: mocks.prepare,
}));
vi.mock("@/lib/voice-audio-api.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-audio-api.server")>(),
  sendVoiceAudioApiResponse: mocks.send,
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth.server")>(),
  getSession: async () => ({ user: { id: "agent-audio" }, headers: new Headers({ "Set-Cookie": "audio-session=refreshed" }) }),
}));

const workspaceId = "7a78b5be-c053-43dd-b073-1221f62fac07";
const intent = "e5f0307a-6df0-448d-848e-57566a6d5fdc", phone = "+16135550801";
const body = { workspaceId, phoneNumber: phone, connection_intent_id: intent };
async function post(payload: unknown = body) {
  const { action } = await import("../app/routes/api+/connect-phone-device.action.server");
  return asRouteResponse(action(routeArgs(new Request("https://audio-api.example.test/api/connect-phone-device", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }))));
}

describe("agent audio session adapter", () => {
  beforeEach(() => {
    setJsonAuthSession({ user: { id: "agent-audio" } });
    mocks.membership.mockReset().mockResolvedValue(undefined);
    mocks.prepare.mockReset().mockResolvedValue({ ok: true, connection: { id: intent } });
    mocks.send.mockReset().mockImplementation(async (_row: unknown, headers?: HeadersInit) => Response.json({ success: true, callSid: "CA" + "1".repeat(32), connection_state: "joining" }, { headers }));
  });
  test("requires session authentication before preparation", async () => {
    setJsonAuthUnauthorized(); expect((await post()).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.membership).not.toHaveBeenCalled();
  });
  test("forwards the signed-in actor, trusted callback base and refreshed cookie headers", async () => {
    const response = await post(); expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBe("audio-session=refreshed");
    await expect(response.json()).resolves.toMatchObject({ success: true, connection_state: "joining" });
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ workspaceId, userId: "agent-audio", intentId: intent,
      transport: "phone", phoneNumber: phone, callSid: undefined, expectedAgentSid: undefined, campaignId: undefined,
      baseUrl: "http://localhost" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.membership).toHaveBeenCalledExactlyOnceWith({ user: { id: "agent-audio" }, workspaceId });
  });
  test.each(["userId", "user_id", "conferenceId", "voiceUrl"])("refuses caller-supplied %s authority", async (key) => {
    expect((await post({ ...body, [key]: "untrusted" })).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  test.each([
    ["insufficient_credits", 402], ["workspace_not_found", 404], ["agent_not_found", 404],
    ["device_not_verified", 403], ["account_changed", 409], ["connection_pending", 409],
  ])("returns the %s contract before a provider send", async (reason, status) => {
    mocks.prepare.mockResolvedValueOnce({ ok: false, reason });
    const response = await post(); expect(response.status).toBe(status); expect(mocks.send).not.toHaveBeenCalled();
    if (reason === "insufficient_credits") await expect(response.json()).resolves.toEqual({ error: "Insufficient credits", creditsError: true });
  });
});
