import { accountSid, actor, rooms, sql, state, web, workspaceId } from "../helpers/voice-audio-fixture";
import { busyPair, participant, scenario, start, voice, useOwnedPredictiveFixture } from "../helpers/voice-phone-predictive-fixture";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { describe, expect, test, vi } from "vitest";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";

async function current() {
  const { loader } = await import("@/routes/api+/connect-phone-device.loader.server");
  return asRouteResponse(loader(routeArgs(new Request(
    `https://audio-connection.example.test/api/connect-phone-device?workspaceId=${workspaceId}&current=1`,
    { headers: { "X-Callcaster-Audio-Actor": actor } },
  ))));
}

describe("saved predictive customer recovery (#2879)", () => {
  useOwnedPredictiveFixture();

  test.each([false, true])("a reload recovers the admitted customer and room without sending another call (joined %s)", async joined => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, voice_url, contact_id, outreach_attempt_id, queue_id from public.workspace_voice_reservation
      where workspace = ${workspaceId}::uuid`;
    expect(await (await voice(root.voice_url, root.provider_sid)).text()).toContain("<Conference");
    if (joined) expect((await participant(f, root, "participant-join", "7")).status).toBe(204);
    const before = await state(), creates = web.create.mock.calls.length, reads = web.fetch.mock.calls.length;
    const response = await current(); expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ customer_pending: true, predictive: {
      revision: expect.stringMatching(/^[1-9]\d*$/), customer: {
        workspace_id: workspaceId, user_id: actor, call_sid: root.provider_sid, campaign_id: f.campaignId,
        contact_id: Number(root.contact_id), outreach_attempt_id: Number(root.outreach_attempt_id),
        queue_id: Number(root.queue_id), attempt: { id: Number(root.outreach_attempt_id), user_id: actor,
          workspace: workspaceId, campaign_id: f.campaignId, contact_id: Number(root.contact_id) },
        conference_id: f.row.conference_id, conference_sid: f.row.conference_sid,
        conference_sequence: joined ? 7 : null, human_state: joined ? "joined" : "pending",
      },
    } });
    expect(body.predictive.customer.call_sid).not.toBe(f.call.sid);
    expect(await state()).toEqual(before); expect(web.create).toHaveBeenCalledTimes(creates);
    expect(web.fetch).toHaveBeenCalledTimes(reads); expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });

  test("the rejected extra answer cannot replace the saved primary customer", async () => {
    const { f, roots } = await busyPair();
    expect((await participant(f, roots[0], "participant-join", "7")).status).toBe(204);
    const response = await current(); expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ predictive: { customer: { call_sid: roots[0].provider_sid,
      human_state: "joined", conference_id: f.row.conference_id, conference_sequence: 7 } } });
    expect(body.predictive.customer.call_sid).not.toBe(roots[1].provider_sid);
    expect(await sql`select account_sid from public.workspace_voice_reservation where id = ${roots[0].id}::uuid`)
      .toMatchObject([{ account_sid: accountSid }]);
    expect(web.create).toHaveBeenCalledTimes(2); expect(rooms.update).not.toHaveBeenCalled();
  });

  test("the exact saved outreach result survives reload after its contact was dequeued", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, voice_url, outreach_attempt_id, queue_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await voice(root.voice_url, root.provider_sid);
    await sql`update public.outreach_attempt set result = '{"q1":"kept answer"}'::jsonb, disposition = 'answered' where id = ${root.outreach_attempt_id}`;
    const response = await current(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ predictive: { customer: { queue_id: Number(root.queue_id),
      attempt: { id: Number(root.outreach_attempt_id), result: { q1: "kept answer" }, disposition: "answered" } } } });
    expect(await sql`select queue_state from public.campaign_queue where id = ${root.queue_id}`).toMatchObject([{ queue_state: "dequeued" }]);
  });

  test("duplicate joins keep their revision; a missed leave advances it and returns no customer", async () => {
    const actual = await vi.importActual<typeof import("@/lib/workspace-events.server")>("@/lib/workspace-events.server");
    vi.mocked(emitPredictiveBroadcast).mockImplementation(actual.emitPredictiveBroadcast);
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, voice_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await voice(root.voice_url, root.provider_sid);
    await participant(f, root, "participant-join", "7");
    const joined = await (await current()).json();
    expect(joined.predictive.customer.human_state).toBe("joined");
    const [joinEvent] = await sql`select payload from public.workspace_events where workspace_id = ${workspaceId}::uuid
      and event_type = 'predictive_broadcast' and payload->>'call_sid' = ${root.provider_sid} order by id desc limit 1`;
    expect(joinEvent.payload.human_revision).toBe(joined.predictive.revision);
    await participant(f, root, "participant-join", "7");
    expect((await (await current()).json()).predictive.revision).toBe(joined.predictive.revision);
    await participant(f, root, "participant-leave", "8");
    const ended = await (await current()).json();
    expect(ended.predictive.customer).toBeNull();
    expect(BigInt(ended.predictive.revision)).toBeGreaterThan(BigInt(joined.predictive.revision));
    const [leaveEvent] = await sql`select payload from public.workspace_events where workspace_id = ${workspaceId}::uuid
      and event_type = 'predictive_broadcast' and payload->>'call_sid' = ${root.provider_sid} order by id desc limit 1`;
    expect(leaveEvent.payload.human_revision).toBe(ended.predictive.revision);
  });

  test("a terminal Call refines the same saved human version to an empty customer", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, voice_url from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await voice(root.voice_url, root.provider_sid); await participant(f, root, "participant-join", "7");
    const joined = await (await current()).json();
    expect(joined.predictive.customer.human_state).toBe("joined");
    await sql`update public.call set status = 'completed' where sid = ${root.provider_sid}`;
    const ended = await (await current()).json();
    expect(ended.predictive).toEqual({ revision: joined.predictive.revision, customer: null });
  });

  test("a mismatched outreach actor blocks recovery instead of exposing another actor's answers", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, voice_url, outreach_attempt_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    await voice(root.voice_url, root.provider_sid);
    await sql`update public.outreach_attempt set user_id = null where id = ${root.outreach_attempt_id}`;
    const response = await current(); expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("result");
  });
});
