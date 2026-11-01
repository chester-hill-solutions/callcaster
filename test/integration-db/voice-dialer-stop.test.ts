import { accountSid, actor, baseUrl, foreignId, otherActor, rooms, signedAudio, signedPredictive, sql, state, web, workspaceId } from "../helpers/voice-audio-fixture";
import { finalStatus, scenario, start, useOwnedPredictiveFixture } from "../helpers/voice-phone-predictive-fixture";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { confirmed } from "../helpers/voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { beforeEach, describe, expect, test } from "vitest";

async function stop(f: Awaited<ReturnType<typeof scenario>>, patch: Record<string, unknown> = {}, actorHeader = actor) {
  const { action } = await import("../../app/routes/api+/auto-dial/end.action.server");
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/auto-dial/end`, { method: "POST",
    headers: { "Content-Type": "application/json", "X-Callcaster-Audio-Actor": actorHeader },
    body: JSON.stringify({ workspaceId, campaignId: f.campaignId, dial_intent_id: f.payload.dial_intent_id, ...patch }),
  }))));
}
async function expireStop(f: Awaited<ReturnType<typeof scenario>>) {
  await sql`update public.workspace_voice_dialer_intent set lease_expires_at = now() where workspace = ${workspaceId}::uuid
    and user_id = ${actor} and intent_id = ${f.payload.dial_intent_id}::uuid`;
}

describe("captured production dialer Stop (#2879)", () => {
  useOwnedPredictiveFixture();
  beforeEach(() => {
    web.list.mockImplementation(async ({ to, from }: { to?: string; from?: string }) =>
      [...web.records.values()].filter(row => (!to || row.to === to) && (!from || row.from === from)));
    web.events.mockImplementation(async (sid: string) => {
      const row = web.records.get(sid); if (!row) throw new Error("Owned request history required");
      return [{ request: { method: "POST", url: row.voiceUrl, parameters: { call_sid: sid } } }];
    });
  });
  async function current() {
    const { loader } = await import("@/routes/api+/connect-phone-device.loader.server");
    return asRouteResponse(loader(routeArgs(new Request(`${baseUrl}/api/connect-phone-device?workspaceId=${workspaceId}&current=1`, {
      headers: { "X-Callcaster-Audio-Actor": actor },
    }))));
  }
  test("current discovery retains exact dialer control without a joined customer or browser journal", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    web.fetch.mockClear(); web.update.mockClear(); const before = await state();
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ predictive: { customer: null }, dialer: { workspace_id: workspaceId,
      user_id: actor, campaign_id: f.campaignId, intent_id: f.payload.dial_intent_id, conference_id: f.row.conference_id, dialer_state: "active" } });
    expect(await state()).toEqual(before); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("a pending original-account Stop is discoverable, then disappears only after closure", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200); web.accountSid = `AC${"9".repeat(32)}`;
    expect((await stop(f)).status).toBe(202);
    await expect((await current()).json()).resolves.toMatchObject({ recovery_required: true, dialer: {
      dialer_state: "stopping", intent_id: f.payload.dial_intent_id, campaign_id: f.campaignId } });
    web.accountSid = accountSid; await expireStop(f); expect((await stop(f)).status).toBe(200);
    await expect((await current()).json()).resolves.toMatchObject({ dialer: null });
  });
  test("current discovery refuses ambiguous session controls instead of choosing the latest", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    await sql`insert into public.workspace_voice_dialer_intent (workspace, user_id, intent_id, campaign_id, stop_requested_at)
      values (${workspaceId}::uuid, ${actor}, ${randomUUID()}::uuid, ${f.campaignId}, now())`;
    expect((await current()).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("genuine phone-agent hangup saves dialer Stop before provider I/O and prevents continuation", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    rooms.update.mockImplementationOnce(async () => {
      const [control] = await sql`select stop_requested_at from public.workspace_voice_dialer_intent
        where workspace = ${workspaceId}::uuid and intent_id = ${f.payload.dial_intent_id}::uuid`;
      expect(control.stop_requested_at).not.toBeNull(); throw new Error("Owned room cleanup unavailable");
    });
    const response = await signedAudio(f.row.conference_callback, { AccountSid: accountSid, CallSid: f.row.provider_sid ?? "",
      ConferenceSid: f.row.conference_sid ?? "", FriendlyName: f.row.conference_id, ParticipantLabel: `audio:${f.row.id}:${f.row.generation}`,
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up", Timestamp: new Date().toISOString() });
    expect(response.status).toBe(500);
    const { runAutoDialerTurn } = await import("@/lib/auto-dial.server");
    expect(await runAutoDialerTurn({ workspace_id: workspaceId, user_id: actor, campaign_id: f.campaignId,
      conference_id: f.row.conference_id })).toMatchObject({ success: false });
    expect(web.create).toHaveBeenCalledTimes(1); expect((await state()).ledger).toBe(0);
  });
  test("stops the exact customer, phone and room while preserving an unknown final bill", async () => {
    const f = await scenario(); const sent = await start(f); expect(sent.status).toBe(200); const { callSid } = await sent.json();
    const customer = web.records.get(callSid); if (!customer) throw new Error("Funded customer required");
    customer.status = "in-progress";
    const before = await state(), response = await stop(f); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, intent_id: f.payload.dial_intent_id, stop_state: "stopped" });
    expect(customer.status).toBe("completed"); expect(["completed", "canceled"]).toContain(f.call.status); expect(f.room.status).toBe("completed");
    expect(await state()).toMatchObject({ credits: before.credits, reservations: 1, ledger: 0 });
    expect(web.create).toHaveBeenCalledTimes(1);
    expect((await start(f)).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test.each([null, "0"])("Stop cannot turn a nonterminal %s duration into final billing", async seconds => {
    const f = await scenario(), sent = await start(f), { callSid } = await sent.json();
    const physical = web.records.get(callSid); if (!physical) throw new Error("Owned customer required");
    physical.status = "in-progress";
    expect((await signedPredictive(physical.statusCallback, { AccountSid: accountSid, CallSid: callSid,
      To: physical.to, From: physical.from, Direction: physical.direction, CallStatus: "in-progress",
      ...(seconds === null ? {} : { CallDuration: seconds }) })).status).toBe(200);
    const [before] = await sql`select duration from public.call where sid = ${callSid}`; expect(before.duration).toBe("0");
    expect((await stop(f)).status).toBe(200);
    const { findVoiceReservationForCall } = await import("@/server/voice-bridge-reservation.server");
    const { reconcileVoiceReservation } = await import("@/lib/voice-credit-recovery.server");
    const reservation = await findVoiceReservationForCall(workspaceId, callSid); if (!reservation) throw new Error("Owned reservation required");
    expect(await reconcileVoiceReservation(reservation)).toBe("pending");
    const [unsettled] = await sql`select state, terminal_duration from public.workspace_voice_reservation where id = ${reservation.id}::uuid`;
    expect(unsettled.terminal_duration).toBeNull(); expect(unsettled.state).not.toBe("settled");
    expect((await state()).credits).toBe(100); expect((await state()).ledger).toBe(0);
    const root = { provider_sid: callSid, status_callback: physical.statusCallback };
    expect((await finalStatus(root, "42")).status).toBe(200); expect((await finalStatus(root, "42")).status).toBe(200);
    expect(await state()).toMatchObject({ credits: 96, ledger: 1 });
  });
  test.each([false, true])("terminal phone status saves Stop only for the current source (retired %s)", async retired => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    if (retired) await sql`update public.workspace_voice_audio_connection set state = 'retired', retired_at = now() where id = ${f.row.id}::uuid`;
    expect((await signedAudio(f.row.status_callback, { AccountSid: accountSid, CallSid: f.row.provider_sid ?? "",
      To: f.call.to, From: f.call.from, Direction: f.call.direction, CallStatus: "completed", CallDuration: "42" })).status).toBe(204);
    const [control] = await sql`select stop_requested_at from public.workspace_voice_dialer_intent
      where workspace = ${workspaceId}::uuid and intent_id = ${f.payload.dial_intent_id}::uuid`;
    expect(Boolean(control.stop_requested_at)).toBe(!retired);
    expect(rooms.update).not.toHaveBeenCalled(); expect((await state()).ledger).toBe(0);
  });
  test("a final billing receipt racing Stop keeps its confirmed duration and one charge", async () => {
    const f = await scenario(), response = await start(f), { callSid } = await response.json();
    const physical = web.records.get(callSid); if (!physical) throw new Error("Owned customer required"); physical.status = "in-progress";
    web.update.mockImplementationOnce(async (sid: string, patch: { status: string }) => {
      expect(sid).toBe(callSid); physical.status = patch.status;
      expect((await finalStatus({ provider_sid: callSid, status_callback: physical.statusCallback }, "42")).status).toBe(200);
      return physical;
    });
    expect((await stop(f)).status).toBe(200);
    const [record] = await sql`select duration from public.call where sid = ${callSid}`; expect(record.duration).toBe("42");
    const [reservation] = await sql`select state, terminal_duration from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(reservation).toMatchObject({ state: "settled", terminal_duration: "42" });
    expect(await state()).toMatchObject({ credits: 96, ledger: 1 });
  });
  test("changed credentials retain a pending original-account Stop until the same request can finish", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    web.accountSid = `AC${"9".repeat(32)}`; web.fetch.mockClear(); web.update.mockClear(); rooms.update.mockClear();
    const response = await stop(f); expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ stop_state: "pending", intent_id: f.payload.dial_intent_id });
    expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
    const [saved] = await sql`select account_sid, stop_requested_at, stopped_at from public.workspace_voice_dialer_intent
      where workspace = ${workspaceId}::uuid and intent_id = ${f.payload.dial_intent_id}::uuid`;
    expect(saved.account_sid).toBe(accountSid); expect(saved.stop_requested_at).not.toBeNull(); expect(saved.stopped_at).toBeNull();
    web.accountSid = accountSid; await expireStop(f);
    expect((await stop(f)).status).toBe(200); expect(f.room.status).toBe("completed");
  });
  test("a lost provider create reply stays pending until its signed receipt binds the call", async () => {
    const f = await scenario(), create = web.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    web.create.mockImplementationOnce(async args => { await create(args); throw new TypeError("Lost provider reply"); });
    expect((await start(f)).status).toBe(409);
    const before = await state(), response = await stop(f); expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ stop_state: "pending" });
    const [root] = await sql`select id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    const accepted = [...web.records.values()].find(row => new URL(row.voiceUrl).searchParams.get("credit_reservation") === root.id);
    if (!accepted) throw new Error("Accepted customer required");
    const params = { AccountSid: accountSid, CallSid: accepted.sid, To: accepted.to, From: accepted.from,
      Direction: accepted.direction, CallStatus: "ringing", CallDuration: "0" };
    const { action } = await import("../../app/routes/api+/auto-dial/status.action.server");
    const receipt = await asRouteResponse(action(routeArgs(new Request(accepted.statusCallback, { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilio.getExpectedTwilioSignature("owned-audio-token", accepted.statusCallback, params),
    }, body: new URLSearchParams(params) }))));
    expect(receipt.status).toBe(200); await expireStop(f);
    expect((await stop(f)).status).toBe(200);
    expect(web.create).toHaveBeenCalledTimes(1); expect(f.room.status).toBe("completed");
    expect((await state()).credits).toBe(before.credits);
  });
  test("an unknown create stays pending; a missing candidate cannot release its hold", async () => {
    const f = await scenario(); web.create.mockRejectedValueOnce(new TypeError("Unknown provider result"));
    expect((await start(f)).status).toBe(409); web.list.mockResolvedValue([]);
    const before = await state(), response = await stop(f); expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ stop_state: "pending" });
    expect(await state()).toMatchObject({ credits: before.credits, reservations: 1, ledger: 0 });
    expect((await start(f, { dial_intent_id: randomUUID() })).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("Stop remains pending when Start's provider create is still in flight, then closes that exact receipt", async () => {
    const f = await scenario(), create = web.create.getMockImplementation(); if (!create) throw new Error("Provider fixture required");
    let reached!: () => void, finish!: (value: { sid: string }) => void;
    const entered = new Promise<void>(resolve => { reached = resolve; }), reply = new Promise<{ sid: string }>(resolve => { finish = resolve; });
    let submitted: { to: string; from: string; url: string; statusCallback: string } | null = null;
    web.create.mockImplementationOnce(args => { submitted = args; reached(); return reply; });
    const starting = start(f); await entered;
    expect((await stop(f)).status).toBe(202); expect((await state()).reservations).toBe(1);
    if (!submitted) throw new Error("Captured provider request required");
    const physical = await create(submitted); finish(physical); await starting;
    const [saved] = await sql`select provider_sid from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(saved.provider_sid).toBe(physical.sid); await expireStop(f);
    expect((await stop(f)).status).toBe(200); expect(["canceled", "completed"]).toContain(physical.status);
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("a failed customer cleanup still closes the owned room and phone, and the same Stop retries", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const update = web.update.getMockImplementation(); if (!update) throw new Error("Provider fixture required");
    web.update.mockRejectedValueOnce(new Error("Provider call stop unavailable"));
    expect((await stop(f)).status).toBe(202); expect(f.room.status).toBe("completed");
    expect(["canceled", "completed"]).toContain(f.call.status); expect(web.create).toHaveBeenCalledTimes(1);
    await expireStop(f); expect((await stop(f)).status).toBe(200); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("a long session cleans bounded batches and cannot report success with an outstanding call", async () => {
    const f = await scenario(30); await sql`update public.workspace set credits = 1000 where id = ${workspaceId}::uuid`;
    expect((await start(f)).status).toBe(200);
    const { runAutoDialerTurn } = await import("@/lib/auto-dial.server");
    for (let index = 0; index < 25; index++) expect(await runAutoDialerTurn({ workspace_id: workspaceId, user_id: actor,
      campaign_id: f.campaignId, conference_id: f.row.conference_id })).toMatchObject({ success: true });
    expect(web.create).toHaveBeenCalledTimes(26);
    expect((await stop(f)).status).toBe(202); await expireStop(f);
    expect((await stop(f)).status).toBe(200);
    expect([...web.records.values()].every(row => ["completed", "canceled"].includes(row.status))).toBe(true);
    expect(web.create).toHaveBeenCalledTimes(26);
  });
  test("deleting campaign metadata does not lose the captured resource owner", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid and id = ${f.campaignId}`;
    expect((await stop(f)).status).toBe(200); expect(f.room.status).toBe("completed"); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test.each(["actor", "workspace", "campaign", "room", "header"])("a mismatched %s cannot stop owned resources", async mismatch => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    const patch: Record<string, unknown> = {};
    if (mismatch === "actor") web.userId = otherActor;
    if (mismatch === "workspace") patch.workspaceId = foreignId;
    if (mismatch === "campaign") patch.campaignId = f.campaignId + 1;
    if (mismatch === "room") patch.conferenceName = `${actor}~${randomUUID()}`;
    web.update.mockClear(); rooms.update.mockClear();
    const response = await stop(f, patch, mismatch === "header" ? otherActor : web.userId);
    expect(response.status).toBe(["header", "room"].includes(mismatch) ? 409 : 404);
    expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled(); expect(f.room.status).toBe("in-progress");
  });
  test("a completed Stop replay cannot close the next explicit session", async () => {
    const f = await scenario(), sent = await start(f); expect(sent.status).toBe(200); const { callSid } = await sent.json();
    const customer = web.records.get(callSid); if (!customer) throw new Error("Funded customer required"); customer.status = "in-progress";
    expect((await stop(f)).status).toBe(200);
    const [root] = await sql`select id, provider_sid, status_callback from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect((await finalStatus(root)).status).toBe(200);
    const source = await confirmed(), next = { ...f, ...source, payload: { ...f.payload, dial_intent_id: randomUUID(),
      audio_connection_id: source.row.id, audio_generation: source.row.generation } };
    expect((await start(next)).status).toBe(200);
    web.update.mockClear(); rooms.update.mockClear();
    expect((await stop(f)).status).toBe(200);
    expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled(); expect(next.room.status).toBe("in-progress");
  });
});
