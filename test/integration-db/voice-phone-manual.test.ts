import { accountSid, actor, baseUrl, callerId, customer, foreignId, journal, otherActor, otherPhone, phone, rooms,
  signedAudio, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { confirmed, customerPhaseLabel } from "../helpers/voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

const windowState = vi.hoisted(() => ({ allowed: true }));
const voicemailStorage = vi.hoisted(() => ({ sign: vi.fn(async () => "https://owned-audio.example.test/drop.mp3") }));
vi.mock("@/lib/object-storage.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(),
  createSignedObjectUrl: voicemailStorage.sign,
}));
vi.mock("@/lib/recipient-calling-window", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: () => ({ allowed: windowState.allowed, timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));

async function scenario() {
  const source = await confirmed();
  const [campaign] = await sql`insert into public.campaign (title, workspace, type, dial_type, caller_id, status)
    values ('Owned phone manual campaign', ${workspaceId}::uuid, 'live_call', 'call', ${callerId}, 'running') returning id`;
  const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
    values (${workspaceId}::uuid, 'Owned phone customer', ${customer}) returning id`;
  const [queue] = await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
    values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, 'queued', 0) returning id`;
  const payload = { to_number: customer, caller_id: callerId, workspace_id: workspaceId, user_id: actor,
    campaign_id: String(campaign.id), contact_id: String(contact.id), queue_id: String(queue.id),
    selected_device: phone, dial_intent_id: randomUUID(), audio_connection_id: source.row.id, audio_generation: source.row.generation };
  return { ...source, payload, queueId: Number(queue.id) };
}

async function start(payload: Record<string, unknown>) {
  const { action } = await import("../../app/routes/api+/dial.action.server");
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/dial`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))));
}

async function hangupCustomer(callSid: string) {
  const { action } = await import("../../app/routes/api+/hangup.action.server");
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/hangup`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, callSid }) }))));
}

async function recoverManualCustomer() {
  const { loader } = await import("../../app/routes/api+/connect-phone-device.loader.server");
  return asRouteResponse(loader(routeArgs(new Request(`${baseUrl}/api/connect-phone-device?workspaceId=${workspaceId}&current=1`,
    { headers: { "X-Callcaster-Audio-Actor": actor } }))));
}

async function dropCustomer(callSid: string, campaignId: string, selectedWorkspace = workspaceId) {
  const { action } = await import("../../app/routes/api+/audiodrop.action.server");
  const body = new FormData(); body.set("workspaceId", selectedWorkspace); body.set("callId", callSid); body.set("campaignId", campaignId);
  return asRouteResponse(action(routeArgs(new Request(`${baseUrl}/api/audiodrop`, { method: "POST", body }))));
}

async function customerVoice(url: string, callSid: string, overrides: Record<string, string> = {}, valid = true, signingToken = "owned-audio-token") {
  const { action } = await import("../../app/routes/api+/dial/$number.action.server");
  const params = { AccountSid: accountSid, CallSid: callSid, To: customer, From: callerId,
    Direction: "outbound-api", CallStatus: "in-progress", ...overrides };
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature(signingToken, url, params) : "invalid",
  }, body: new URLSearchParams(params) }))));
}

describe("manual Start reuses confirmed phone audio", () => {
  useOwnedAudioFixture();
  beforeEach(async () => {
    windowState.allowed = true;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign_queue where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
  });

  test("Start calls only the customer with one hold, one attempt and a real root SID", async () => {
    const f = await scenario(), response = await start(f.payload);
    expect(response.status).toBe(200); const body = await response.json();
    expect(body).toMatchObject({ success: true, callSid: expect.stringMatching(/^CA[0-9a-f]{32}$/i) });
    expect(body.callSid).not.toBe(f.call.sid); expect(web.create).toHaveBeenCalledTimes(1);
    expect(web.create.mock.calls[0][0]).toMatchObject({ to: customer, from: callerId, record: true, trim: "do-not-trim" });
    const [reservation] = await sql`select provider_sid, setup_sid, audio_agent_sid, conference_id, credits from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(reservation).toMatchObject({ provider_sid: body.callSid, setup_sid: null, audio_agent_sid: f.call.sid,
      conference_id: f.row.conference_id, credits: 4 });
    expect(await state()).toMatchObject({ credits: 100, reservations: 1, attempts: 1, ledger: 0, operations: 1 });
  });

  test.each(["initiated", "ringing", "in-progress", "completed"])("reload recovers the manual %s customer and exact saved answers without another send", async status => {
    const f = await scenario(), sent = await start(f.payload);
    expect(sent.status).toBe(200);
    const { callSid } = await sent.json();
    const [reservation] = await sql`select * from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    await sql`update public.call set status = ${status} where sid = ${callSid}`;
    await sql`update public.outreach_attempt set result = '{"q1":"saved manual answer"}'::jsonb, current_step = 'question-2'
      where id = ${reservation.outreach_attempt_id}`;
    await sql`update public.campaign_queue set queue_state = 'dequeued', dequeued_at = now() where id = ${f.queueId}`;
    const before = await state(); web.fetch.mockClear(); web.update.mockClear();
    const response = await recoverManualCustomer(); expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.manual).toMatchObject({ reservation_id: reservation.id, dial_intent_id: f.payload.dial_intent_id,
      workspace_id: workspaceId, user_id: actor, campaign_id: Number(f.payload.campaign_id),
      call_sid: callSid, provider_status: status, contact_id: Number(f.payload.contact_id), queue_id: f.queueId,
      outreach_attempt_id: Number(reservation.outreach_attempt_id), conference_id: f.row.conference_id,
      attempt: { id: Number(reservation.outreach_attempt_id), current_step: "question-2", result: { q1: "saved manual answer" } } });
    expect(body.manual.call_sid).not.toBe(f.row.provider_sid);
    expect(body.customer_pending).toBe(true);
    expect(await state()).toEqual(before);
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test.each(["account", "parent", "direction", "recipient", "attempt-actor"])("manual recovery refuses mismatched %s without commands or writes", async mismatch => {
    const f = await scenario(), sent = await start(f.payload); expect(sent.status).toBe(200);
    const { callSid } = await sent.json();
    if (mismatch === "account") await sql`update public.call set account_sid = ${`AC${"9".repeat(32)}`} where sid = ${callSid}`;
    if (mismatch === "parent") await sql`update public.call set parent_call_sid = ${f.call.sid} where sid = ${callSid}`;
    if (mismatch === "direction") await sql`update public.call set direction = 'outbound-dial' where sid = ${callSid}`;
    if (mismatch === "recipient") await sql`update public.call set "to" = ${otherPhone} where sid = ${callSid}`;
    if (mismatch === "attempt-actor") await sql`update public.outreach_attempt set user_id = ${otherActor}::uuid where id =
      (select outreach_attempt_id from public.workspace_voice_reservation where provider_sid = ${callSid})`;
    const before = await state(); web.fetch.mockClear(); web.update.mockClear();
    expect((await recoverManualCustomer()).status).toBe(409);
    expect(await state()).toEqual(before); expect(web.create).toHaveBeenCalledTimes(1);
    expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test("Voice Drop redirects the funded customer root and retains the phone, queue and single hold", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    await sql`update public.campaign set voicedrop_audio = 'owned-drop.mp3' where id = ${Number(f.payload.campaign_id)}`;
    const before = await state(); web.update.mockClear();
    const outcomes = await sql`select q.queue_state, q.dequeued_at, q.provider_status, a.disposition, a.answered_at
      from public.workspace_voice_reservation r join public.campaign_queue q on q.id = r.queue_id
      join public.outreach_attempt a on a.id = r.outreach_attempt_id where r.provider_sid = ${callSid}`;
    expect(await dropCustomer(callSid, f.payload.campaign_id)).toMatchObject({ success: true });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(callSid, { twiml: expect.stringContaining('<Play>https://owned-audio.example.test/drop.mp3</Play>') });
    expect(voicemailStorage.sign).toHaveBeenCalledWith('workspaceAudio', `${workspaceId}/owned-drop.mp3`, 3600);
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled(); expect(f.room.status).toBe('in-progress');
    expect(await sql`select q.queue_state, q.dequeued_at, q.provider_status, a.disposition, a.answered_at
      from public.workspace_voice_reservation r join public.campaign_queue q on q.id = r.queue_id
      join public.outreach_attempt a on a.id = r.outreach_attempt_id where r.provider_sid = ${callSid}`).toEqual(outcomes);
  });

  test("Voice Drop refuses a changed provider account and can retry the same root after restoration", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    await sql`update public.campaign set voicedrop_audio = 'owned-drop.mp3' where id = ${Number(f.payload.campaign_id)}`;
    const before = await state(); web.update.mockClear(); web.accountSid = `AC${randomUUID().replaceAll('-', '')}`;
    expect(await dropCustomer(callSid, f.payload.campaign_id)).toMatchObject({ success: false });
    expect(web.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
    web.accountSid = accountSid;
    expect(await dropCustomer(callSid, f.payload.campaign_id)).toMatchObject({ success: true });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(callSid, expect.objectContaining({ twiml: expect.stringContaining('<Play>') }));
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled();
  });

  test.each(['campaign', 'audio-leg', 'terminal', 'terminal-call'])('Voice Drop rejects a mismatched %s before provider commands', async mismatch => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    await sql`update public.campaign set voicedrop_audio = 'owned-drop.mp3' where id = ${Number(f.payload.campaign_id)}`;
    if (mismatch === 'terminal') await sql`update public.workspace_voice_reservation set terminal_status = 'completed' where provider_sid = ${callSid}`;
    if (mismatch === 'terminal-call') await sql`update public.call set status = 'completed' where sid = ${callSid}`;
    const before = await state(); web.update.mockClear();
    expect(await dropCustomer(mismatch === 'audio-leg' ? f.call.sid : callSid,
      mismatch === 'campaign' ? String(Number(f.payload.campaign_id) + 1) : f.payload.campaign_id)).toMatchObject({ success: false });
    expect(web.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled();
  });

  test("another workspace cannot redirect the funded customer", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    const before = await state(); web.update.mockClear();
    expect((await dropCustomer(callSid, f.payload.campaign_id, foreignId)).status).toBe(404);
    expect(web.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });

  test("Voice Drop reports a provider refusal without changing the customer funding or phone", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    await sql`update public.campaign set voicedrop_audio = 'owned-drop.mp3' where id = ${Number(f.payload.campaign_id)}`;
    const before = await state(); web.update.mockClear(); web.update.mockRejectedValueOnce(new Error('Owned provider redirect refusal'));
    expect(await dropCustomer(callSid, f.payload.campaign_id)).toMatchObject({ success: false,
      error: "Could not send voicemail audio. Check the call and try again." });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(callSid, expect.objectContaining({ twiml: expect.stringContaining('<Play>') }));
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled(); expect(f.room.status).toBe('in-progress');
  });

  test("an older unfunded SDK customer remains a valid Voice Drop target", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200); const { callSid } = await response.json();
    await sql`update public.campaign set voicedrop_audio = 'owned-drop.mp3' where id = ${Number(f.payload.campaign_id)}`;
    await sql`delete from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    const parentSid = `CA${randomUUID().replaceAll('-', '')}`;
    await sql`insert into public.call (sid, workspace, user_id, direction, status)
      values (${parentSid}, ${workspaceId}::uuid, ${actor}::uuid, 'inbound', 'in-progress')`;
    await sql`update public.call set parent_call_sid = ${parentSid}, direction = 'outbound-dial' where sid = ${callSid}`;
    const before = await state(); web.update.mockClear();
    expect(await dropCustomer(callSid, f.payload.campaign_id)).toMatchObject({ success: true });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(callSid, expect.objectContaining({ twiml: expect.stringContaining('<Play>') }));
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled();
  });

  test("same-intent retries precede mutable phone, queue and calling-window checks", async () => {
    const f = await scenario(), first = await start(f.payload); expect(first.status).toBe(200); const body = await first.json();
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    await sql`update public.workspace_voice_audio_connection set state = 'failed', cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await sql`update public.campaign_queue set dispatch_generation = gen_random_uuid() where id = ${f.queueId}`;
    windowState.allowed = false; web.fetch.mockClear();
    const replay = await start(f.payload); expect(replay.status).toBe(200); expect(await replay.json()).toEqual(body);
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.fetch).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
  });

  test("concurrent Start retries create one customer and one outreach attempt", async () => {
    const f = await scenario();
    const responses = await Promise.all(Array.from({ length: 12 }, () => start(f.payload)));
    expect(responses.every(response => response.status === 200 || response.status === 409)).toBe(true);
    expect(responses.some(response => response.status === 200)).toBe(true);
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
    expect((await start(f.payload)).status).toBe(200);
  });

  test.each(["active", "failed", "canceled", "retired"])("omitted source fields cannot ring another agent while audio is %s", async audioState => {
    const f = await scenario();
    await sql`update public.workspace_voice_audio_connection set state = ${audioState} where id = ${f.row.id}::uuid`;
    const response = await start({ ...f.payload, audio_connection_id: undefined, audio_generation: undefined });
    expect(response.status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, ledger: 0 });
  });

  test("an unsent phone preparation also blocks a new legacy setup", async () => {
    const f = await scenario();
    await sql`update public.workspace_voice_audio_connection set state = 'prepared', provider_sid = null,
      joined_at = null, conference_sid = null where id = ${f.row.id}::uuid`;
    expect((await start({ ...f.payload, audio_connection_id: undefined, audio_generation: undefined })).status).toBe(409);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("an unfinished room stop blocks legacy setup after the phone ended", async () => {
    const f = await scenario();
    await sql`update public.workspace_voice_audio_connection set state = 'retired', terminal_at = now(),
      conference_stop_requested_at = now(), conference_stop_call_sid = ${f.call.sid} where id = ${f.row.id}::uuid`;
    expect((await start({ ...f.payload, audio_connection_id: undefined, audio_generation: undefined })).status).toBe(409);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("settled audio permits legacy setup and an accepted retry survives a later connection", async () => {
    const f = await scenario(), payload = { ...f.payload, audio_connection_id: undefined, audio_generation: undefined };
    await sql`update public.workspace_voice_audio_connection set state = 'retired', terminal_at = now() where id = ${f.row.id}::uuid`;
    const first = await start(payload); expect(first.status).toBe(200); expect(first.headers.get("Content-Type")).toBe("text/xml");
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.create.mock.calls[0][0]).toMatchObject({ to: phone });
    await sql`update public.workspace_voice_audio_connection set state = 'active', terminal_at = null where id = ${f.row.id}::uuid`;
    expect((await start(payload)).status).toBe(200); expect(web.create).toHaveBeenCalledTimes(1);
    expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
  });

  test.each([
    { audio_generation: 2 }, { selected_device: otherPhone }, { audio_connection_id: randomUUID() },
  ])("refuses stale source %j before funding or customer create", async patch => {
    const f = await scenario(); expect((await start({ ...f.payload, ...patch })).status).toBe(409);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0, ledger: 0 });
  });

  test.each([
    { audio_generation: undefined }, { audio_connection_id: undefined }, { dial_intent_id: undefined },
    { selected_device: "computer" }, { audio_generation: true }, { audio_generation: 1.5 },
  ])("rejects an incomplete or invalid adopted-phone request %j", async patch => {
    const f = await scenario(); expect((await start({ ...f.payload, ...patch })).status).toBe(400);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("a foreign workspace cannot select this actor's phone source", async () => {
    const f = await scenario(); expect((await start({ ...f.payload, workspace_id: foreignId })).status).toBe(404);
    expect(web.create).not.toHaveBeenCalled();
  });

  test("a saved active source cannot hide a physically ended phone", async () => {
    const f = await scenario(); f.call.status = "completed";
    expect((await start(f.payload)).status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("an accepted customer joins the original room once without another Dial number", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    const voice = await customerVoice(url, callSid); expect(voice.status).toBe(200); const xml = await voice.text();
    expect(xml).toContain("<Conference"); expect(xml).toContain(f.row.conference_id); expect(xml).not.toContain("<Number");
    const [reservation] = await sql`select id, recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(xml).toContain(`participantLabel="customer:v1:${reservation.id}:`);
    expect(xml).toContain(f.row.conference_callback.replaceAll("&", "&amp;")); expect(reservation.recipient_instruction_issued_at).not.toBeNull();
    expect((await (await customerVoice(url, callSid)).text())).not.toContain("<Conference");
    expect(web.create).toHaveBeenCalledTimes(1);
    const [queue] = await sql`select dequeued_at from public.campaign_queue where id = ${f.queueId}`;
    expect(queue.dequeued_at).toBeNull();
  });

  test("a stopped phone between customer create and voice instructions cannot join", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    expect(await (await customerVoice(url, callSid)).text()).not.toContain("<Conference");
    const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(row.recipient_instruction_issued_at).toBeNull(); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("physical phone readiness is checked again after the customer Call is accepted", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    f.call.status = "completed";
    expect(await (await customerVoice(url, callSid)).text()).not.toContain("<Conference");
    const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(row.recipient_instruction_issued_at).toBeNull(); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("concurrent voice retries issue one customer conference instruction", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    const replies = await Promise.all(Array.from({ length: 12 }, async () => (await customerVoice(url, callSid)).text()));
    expect(replies.filter(xml => xml.includes("<Conference"))).toHaveLength(1); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("invalid customer voice signatures stop before another physical source read", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    web.fetch.mockClear(); expect((await customerVoice(url, callSid, {}, false)).status).toBe(403);
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test("replacement-account credentials cannot authenticate the original customer voice URL", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"8".repeat(32)}`, authToken: "replacement-token" })} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server"); invalidateWorkspaceTwilioData(workspaceId);
    web.fetch.mockClear(); expect((await customerVoice(url, callSid, {}, true, "replacement-token")).status).toBe(403);
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test("customer hangup targets the customer root and preserves the connected phone", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json();
    web.update.mockImplementationOnce(async (id: string, args: { twiml: string }) => {
      expect(id).toBe(callSid); expect(args.twiml).toContain("<Hangup");
      const physical = web.records.get(id); if (!physical) throw new Error("Owned customer required");
      physical.status = "completed"; physical.duration = "42"; return physical;
    });
    const result = await hangupCustomer(callSid);
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ success: true });
    expect(web.update).toHaveBeenCalledTimes(1); expect(rooms.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.state).toBe("active");
  });

  test("funded customer hangup refuses a replacement account before provider or queue changes", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), before = await state();
    const [attempt] = await sql`select disposition from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    const [reservation] = await sql`select state, account_sid, provider_sid, credits from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    web.accountSid = `AC${"8".repeat(32)}`;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: web.accountSid, authToken: "replacement-token" })} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server"); invalidateWorkspaceTwilioData(workspaceId);
    web.update.mockClear();
    const result = await hangupCustomer(callSid);
    expect(result.status).toBe(500);
    expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
    expect(await state()).toEqual(before);
    expect(await sql`select state, account_sid, provider_sid, credits from public.workspace_voice_reservation where provider_sid = ${callSid}`).toEqual([reservation]);
    expect(await sql`select disposition from public.outreach_attempt where workspace = ${workspaceId}::uuid`).toEqual([attempt]);
    const [queue] = await sql`select dequeued_at from public.campaign_queue where id = ${f.queueId}`;
    expect(queue.dequeued_at).toBeNull();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.state).toBe("active");
    web.accountSid = accountSid;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: accountSid, authToken: "owned-audio-token" })} where id = ${workspaceId}::uuid`;
    invalidateWorkspaceTwilioData(workspaceId);
    web.update.mockImplementationOnce(async (id: string, args: { twiml: string }) => {
      expect(id).toBe(callSid); expect(args.twiml).toContain("<Hangup"); return { sid: id };
    });
    expect((await hangupCustomer(callSid)).status).toBe(200);
    expect(web.update).toHaveBeenCalledTimes(1); expect(web.create).toHaveBeenCalledTimes(1);
    expect(rooms.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.state).toBe("active");
  });

  test("a customer cannot claim an agent participant label", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error("Owned customer voice URL required");
    expect(await (await customerVoice(url, callSid)).text()).toContain("<Conference");
    expect((await signedAudio(f.row.conference_callback, { AccountSid: accountSid, CallSid: callSid,
      ConferenceSid: f.row.conference_sid ?? "", FriendlyName: f.row.conference_id, StatusCallbackEvent: "participant-join",
      ParticipantLabel: `audio:${f.row.id}:${f.row.generation}`, Muted: "false" })).status).toBe(403);
    expect(rooms.update).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ ledger: 0, reservations: 1 });
  });

  test("a funded root cannot claim a room participant before its join instruction", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json(), url = web.records.get(callSid)?.voiceUrl;
    if (!url) throw new Error("Owned customer voice URL required");
    const [reservation] = await sql`select id from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    const payload = { AccountSid: accountSid, CallSid: callSid, ConferenceSid: f.row.conference_sid ?? "",
      FriendlyName: f.row.conference_id, StatusCallbackEvent: "participant-join", ParticipantLabel: `customer:${reservation.id}`, Muted: "false" };
    expect((await signedAudio(f.row.conference_callback, payload)).status).toBe(403);
    expect(await (await customerVoice(url, callSid)).text()).toContain("<Conference");
    expect((await signedAudio(f.row.conference_callback, { ...payload, ParticipantLabel: await customerPhaseLabel(reservation.id) })).status).toBe(204);
    expect(rooms.update).not.toHaveBeenCalled(); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("the real agent departure keeps durable room stop separate from customer billing", async () => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    expect((await signedAudio(f.row.conference_callback, { AccountSid: accountSid, CallSid: f.call.sid,
      ConferenceSid: f.row.conference_sid ?? "", FriendlyName: f.row.conference_id, StatusCallbackEvent: "participant-leave",
      ParticipantLabel: `audio:${f.row.id}:${f.row.generation}`, Muted: "false", ReasonParticipantLeft: "participant_hung_up" })).status).toBe(204);
    expect(rooms.update).toHaveBeenCalledTimes(1);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "failed", conference_stopped_at: expect.any(Date) });
    expect(await state()).toMatchObject({ reservations: 1, ledger: 0, attempts: 1 });
  });

  test.each(["participant-join", "participant-leave"])("the first phone callback routes customer %s without ending its room", async event => {
    const f = await scenario(), response = await start(f.payload); expect(response.status).toBe(200);
    const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error("Owned customer voice URL required");
    expect(await (await customerVoice(url, callSid)).text()).toContain("<Conference");
    const [reservation] = await sql`select id from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    const payload = { AccountSid: accountSid, CallSid: callSid, ConferenceSid: f.row.conference_sid ?? "", FriendlyName: f.row.conference_id,
      StatusCallbackEvent: event, ParticipantLabel: await customerPhaseLabel(reservation.id), Muted: "false", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedAudio(f.row.conference_callback, payload)).status).toBe(204);
    expect((await signedAudio(f.row.conference_callback, payload)).status).toBe(204);
    expect(rooms.update).not.toHaveBeenCalled(); expect((await journal.findVoiceAudioConnection(f.row.id))?.state).toBe("active");
    expect(await state()).toMatchObject({ operations: 1, reservations: 1, attempts: 1, ledger: 0 });
    if (event === "participant-leave") {
      expect((await start({ ...f.payload, dial_intent_id: randomUUID() })).status).toBe(409);
      expect(web.create).toHaveBeenCalledTimes(1);
    }
  });
});
