import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { setJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({ stop: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/voice-dialer-stop.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/voice-dialer-stop.server")>(), stopCapturedDialer: mocks.stop,
}));
vi.mock("@/lib/database/workspace.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(), requireWorkspaceAccess: mocks.access,
}));
const workspaceId = "10000000-0000-4000-8000-000000000001", intentId = "20000000-0000-4000-8000-000000000001";
const owner = { workspaceId, userId: "captured-agent", campaignId: 42, intentId };
const body = { workspaceId, campaignId: "42", dial_intent_id: intentId, conferenceName: "captured-room" };
async function request(value: unknown = body, actor = owner.userId) {
  const { action } = await import("@/routes/api+/auto-dial/end.action.server");
  return asRouteResponse(action(routeArgs(new Request("https://example.test/api/auto-dial/end", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Callcaster-Audio-Actor": actor }, body: JSON.stringify(value) }))));
}
function snapshot(stop_state = "stopped") {
  return { success: true, workspace_id: workspaceId, user_id: owner.userId, campaign_id: 42, intent_id: intentId,
    conference_id: body.conferenceName, stop_state };
}

describe("captured dialer Stop HTTP adapter", () => {
  beforeEach(() => {
    mocks.stop.mockReset(); mocks.access.mockReset(); mocks.access.mockResolvedValue(undefined);
    setJsonAuthSession({ user: { id: owner.userId } });
  });
  test.each([["stopped", 200], ["pending", 202]])("returns %s only with the matching HTTP status", async (state, code) => {
    mocks.stop.mockResolvedValue({ ok: true, snapshot: snapshot(String(state)) });
    const response = await request(); expect(response.status).toBe(code);
    await expect(response.json()).resolves.toEqual(snapshot(String(state)));
    expect(mocks.access).toHaveBeenCalledWith({ user: { id: owner.userId }, workspaceId });
    expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(owner, body.conferenceName);
  });
  test.each([null, {}, { workspaceId }, { workspaceId, conferenceName: "arbitrary-room" }, { ...body, campaignId: true }])("refuses an incomplete or ambiguous Stop: %j", async value => {
    expect((await request(value)).status).toBe(400); expect(mocks.stop).not.toHaveBeenCalled();
  });
  test("an actor change cannot cancel the new actor's session", async () => {
    expect((await request(body, "previous-actor")).status).toBe(409); expect(mocks.stop).not.toHaveBeenCalled();
  });
  test("membership keeps its uniform 404", async () => {
    mocks.access.mockRejectedValue(new Response("Not found", { status: 404 }));
    expect((await request()).status).toBe(404); expect(mocks.stop).not.toHaveBeenCalled();
  });
  test.each([404, 409])("returns a captured identity refusal %i", async status => {
    mocks.stop.mockResolvedValue({ ok: false, status }); expect((await request()).status).toBe(status);
  });
});
