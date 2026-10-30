import { accountSid, actor, baseUrl, callerId, clearFault, customer, fault, foreignId, otherActor, phone, rooms, signedAudio,
  sid, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { confirmed } from "../helpers/voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { dataPlaneAuthContext } from "@/lib/route-context.server";
import { createTenantDb } from "@/server/tenant-db";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { runPredictiveMachineContinuation } from "@/lib/predictive-machine.server";

const windowState = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/recipient-calling-window", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: () => ({ allowed: windowState.allowed, timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));

async function scenario(count = 3) {
  const f = await confirmed();
  const schedule = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day =>
    [day, { active: true, intervals: [{ start: "00:00", end: "12:00" }, { start: "12:00", end: "00:00" }] }]));
  const [campaign] = await sql`insert into public.campaign (workspace, title, type, status, caller_id, schedule, start_date, end_date)
    values (${workspaceId}::uuid, 'Owned phone predictive campaign', 'live_call', 'running', ${callerId},
      ${sql.json(schedule)}, '2000-01-01', '2100-01-01') returning id`;
  for (let index = 0; index < count; index++) {
    const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
      values (${workspaceId}::uuid, 'Owned predictive customer', ${index === 0 ? customer : `+161355507${String(index).padStart(2, "0")}`}) returning id`;
    await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
      values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, 'queued', ${index})`;
  }
  return { ...f, campaignId: Number(campaign.id), payload: { caller_id: callerId, selected_device: phone,
    dial_intent_id: randomUUID(), audio_connection_id: f.row.id, audio_generation: f.row.generation } };
}

async function start(f: Awaited<ReturnType<typeof scenario>>, patch: Record<string, unknown> = {}, options: {
  apiKey?: boolean; scopes?: string[]; workspace?: string; userId?: string;
} = {}) {
  const targetWorkspace = options.workspace ?? workspaceId, context = new RouterContextProvider();
  context.set(dataPlaneAuthContext, { workspaceId: targetWorkspace, userId: options.apiKey ? null : options.userId ?? actor,
    ...(options.apiKey ? { apiKey: { keyId: 'owned-phone-start', scopes: options.scopes ?? ['calls.start'] } } : {}),
    tdb: createTenantDb(targetWorkspace) });
  const { action } = await import("../../app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.action.server");
  return asRouteResponse(action({ ...routeArgs(new Request(`${baseUrl}/api/workspaces/${targetWorkspace}/campaigns/${f.campaignId}/dialer/start`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...f.payload, ...(options.apiKey ? { agentUserId: actor } : {}), ...patch }),
  }), { workspaceId: targetWorkspace, campaignId: String(f.campaignId) }), context }));
}

async function voice(url: string, callSid: string, patch: Record<string, string> = {}, valid = true, token = "owned-audio-token") {
  const params = { AccountSid: accountSid, CallSid: callSid, To: web.records.get(callSid)?.to ?? customer,
    From: callerId, Direction: "outbound-api", CallStatus: "in-progress", AnsweredBy: "human", ...patch };
  const { action } = await import("../../app/routes/api+/auto-dial/$roomId.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature(token, url, params) : "invalid",
  }, body: new URLSearchParams(params) }), { roomId: decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '') })));
}

describe("predictive Start reuses confirmed phone audio", () => {
  useOwnedAudioFixture();
  beforeEach(async () => {
    windowState.allowed = true;
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${otherActor}`;
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${otherActor}::uuid`;
    await sql`delete from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign_queue where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
  });

  test.each([false, true])("authorized Start uses the real phone room and one recorded AMD customer (API key %s)", async apiKey => {
    const f = await scenario(), response = await start(f, {}, { apiKey });
    expect(response.status).toBe(200); const body = await response.json();
    expect(body).toMatchObject({ success: true, conferenceName: f.row.conference_id, callSid: expect.stringMatching(/^CA[0-9a-f]{32}$/i) });
    expect(body.callSid).not.toBe(f.call.sid); expect(web.create).toHaveBeenCalledTimes(1);
    expect(web.create.mock.calls[0][0]).toMatchObject({ to: customer, record: true, recordingChannels: "dual",
      recordingTrack: "both", trim: "do-not-trim", machineDetection: "Enable" });
    const [row] = await sql`select provider_sid, setup_sid, audio_mode, conference_id, customer_recording_id from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(row).toMatchObject({ provider_sid: body.callSid, setup_sid: null, audio_mode: 'predictive', conference_id: f.row.conference_id });
    expect(row.customer_recording_id).not.toBeNull(); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0, credits: 100 });
    const [queue] = await sql`select count(*)::int as completed from public.campaign_queue where workspace = ${workspaceId}::uuid and dequeued_at is not null`;
    expect(queue.completed).toBe(1);
  });

  test("accepted retry returns the saved room and customer before mutable phone, campaign and queue checks", async () => {
    const f = await scenario(), first = await start(f); expect(first.status).toBe(200); const body = await first.json();
    await sql`update public.workspace_voice_audio_connection set state = 'failed', cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    await sql`update public.campaign set status = 'paused' where id = ${f.campaignId}`;
    await sql`update public.campaign_queue set dispatch_generation = gen_random_uuid() where workspace = ${workspaceId}::uuid`;
    windowState.allowed = false; web.fetch.mockClear();
    const replay = await start(f); expect(replay.status).toBe(200); expect(await replay.json()).toEqual(body);
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 1, attempts: 1 });
  });

  test("concurrent Start retries create one customer and preserve the saved room", async () => {
    const f = await scenario(); const responses = await Promise.all(Array.from({ length: 12 }, () => start(f)));
    expect(responses.every(r => [200, 409].includes(r.status))).toBe(true); expect(responses.some(r => r.status === 200)).toBe(true);
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
    expect(await (await start(f)).json()).toMatchObject({ conferenceName: f.row.conference_id });
  });

  test.each([{ audio_generation: 2 }, { audio_connection_id: randomUUID() }, { selected_device: '+16135550602' }])("rejects a stale source %j without a hold or queue claim", async patch => {
    const f = await scenario(); expect((await start(f, patch)).status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
    expect(await sql`select id from public.campaign_queue where workspace = ${workspaceId}::uuid and assigned_to_user_id is not null`).toHaveLength(0);
  });

  test.each([{ audio_generation: undefined }, { audio_connection_id: undefined }, { dial_intent_id: undefined },
    { selected_device: 'computer' }, { audio_generation: true }])("requires paired phone source and stable Start identity %j", async patch => {
    const f = await scenario(); expect((await start(f, patch)).status).toBe(400); expect(web.create).not.toHaveBeenCalled();
  });

  test("missing source fields cannot start another agent while the phone is connected", async () => {
    const f = await scenario(); expect((await start(f, { audio_connection_id: undefined, audio_generation: undefined })).status).toBe(409);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("a source stop after physical verification rolls back queue, outreach and funding", async () => {
    const f = await scenario();
    rooms.participant.mockImplementation(async () => {
      await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
      return f.participant;
    });
    expect((await start(f)).status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, ledger: 0 });
    expect(await sql`select id from public.campaign_queue where workspace = ${workspaceId}::uuid and assigned_to_user_id is not null`).toHaveLength(0);
  });

  test("insufficient credits do not claim or dequeue the next customer", async () => {
    const f = await scenario(); await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    expect((await start(f)).status).toBe(402); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, ledger: 0 });
    expect(await sql`select id from public.campaign_queue where workspace = ${workspaceId}::uuid and (assigned_to_user_id is not null or dequeued_at is not null)`).toHaveLength(0);
  });

  test("accepted intent cannot change its phone generation, destination or source", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    for (const patch of [{ audio_generation: 2 }, { selected_device: '+16135550602' }, { audio_connection_id: randomUUID() }])
      expect((await start(f, patch)).status).toBe(409);
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1 });
  });

  test("definite customer rejection requeues without stopping the phone and permits a fresh send", async () => {
    const f = await scenario(); web.create.mockRejectedValueOnce({ status: 400, message: 'Owned provider rejection' });
    expect((await start(f)).status).toBe(500); expect(rooms.update).not.toHaveBeenCalled();
    const [released] = await sql`select state from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(released.state).toBe('released');
    expect(await sql`select id from public.campaign_queue where workspace = ${workspaceId}::uuid and (assigned_to_user_id is not null or dequeued_at is not null)`).toHaveLength(0);
    expect((await start(f)).status).toBe(200); expect(web.create).toHaveBeenCalledTimes(2); expect(f.room.status).toBe('in-progress');
  });

  test("foreign membership, insufficient key scope and a different target agent are refused", async () => {
    const f = await scenario(); expect((await start(f, {}, { workspace: foreignId })).status).toBe(404);
    expect((await start(f, {}, { apiKey: true, scopes: ['messages.send'] })).status).toBe(403);
    expect((await start(f, { agentUserId: otherActor }, { apiKey: true })).status).toBe(403);
    expect(web.create).not.toHaveBeenCalled(); expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("an authorized agent with the same verified number cannot adopt another actor's source", async () => {
    const f = await scenario();
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`predictive-other:${workspaceId}:${otherActor}`}, ${workspaceId}, ${otherActor}, 'caller')`;
    await sql`update public."user" set verified_audio_numbers = ${sql.array([phone])} where id = ${otherActor}::uuid`;
    web.fetch.mockClear();
    expect((await start(f, { agentUserId: otherActor }, { apiKey: true })).status).toBe(409);
    expect(web.fetch).not.toHaveBeenCalled(); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0 });
  });

  test("a human customer gets one source-checked join that cannot end the persistent room", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned customer voice URL required');
    const result = await voice(url, callSid); expect(result.status).toBe(200); const xml = await result.text();
    expect(xml).toContain('<Conference'); expect(xml).toContain(f.row.conference_id); expect(xml).toContain('endConferenceOnExit="false"');
    expect(xml).toContain(f.row.conference_callback.replaceAll('&', '&amp;')); expect(xml).not.toContain('<Number');
    expect((await (await voice(url, callSid)).text())).not.toContain('<Conference'); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("concurrent customer voice retries issue only one conference instruction", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    const xml = await Promise.all(Array.from({ length: 12 }, async () => (await voice(url, callSid)).text()));
    expect(xml.filter(value => value.includes('<Conference'))).toHaveLength(1); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("invalid voice signatures cannot read the physical phone or issue a join", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required'); web.fetch.mockClear();
    expect((await voice(url, callSid, {}, false)).status).toBe(403); expect(web.fetch).not.toHaveBeenCalled();
    const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(row.recipient_instruction_issued_at).toBeNull();
  });

  test("replacement-account credentials cannot authenticate the original customer voice URL", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    const replacement = `AC${'9'.repeat(32)}`;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: replacement, authToken: 'replacement-token' })} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server"); invalidateWorkspaceTwilioData(workspaceId);
    web.accountSid = replacement; web.fetch.mockClear();
    expect((await voice(url, callSid, {}, true, 'replacement-token')).status).toBe(403); expect(web.fetch).not.toHaveBeenCalled();
  });

  test("duplicate raw voice fields are refused before phone reads or customer instructions", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    const params = { AccountSid: accountSid, CallSid: callSid, To: customer, From: callerId, Direction: 'outbound-api', CallStatus: 'in-progress', AnsweredBy: 'human' };
    const body = new URLSearchParams([['To', '+16135550999'], ...Object.entries(params)]); web.fetch.mockClear();
    const { action } = await import("../../app/routes/api+/auto-dial/$roomId.action.server");
    expect((await asRouteResponse(action(routeArgs(new Request(url, { method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': twilio.getExpectedTwilioSignature('owned-audio-token', url, params),
    }, body }), { roomId: f.row.conference_id })))).status).toBe(403);
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test("a stopped phone after customer acceptance cannot receive a customer join", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required'); f.call.status = 'completed';
    expect((await (await voice(url, callSid)).text())).not.toContain('<Conference');
    const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(row.recipient_instruction_issued_at).toBeNull(); expect(web.create).toHaveBeenCalledTimes(1);
  });

  test("an early signed customer voice callback survives a lost create reply without another POST", async () => {
    const f = await scenario(), callSid = sid();
    web.create.mockImplementationOnce(async args => {
      web.records.set(callSid, { ...f.call, sid: callSid, to: customer, voiceUrl: args.url, statusCallback: args.statusCallback });
      expect((await (await voice(args.url, callSid)).text())).toContain('<Conference');
      throw new Error('Lost accepted predictive create response');
    });
    const first = await start(f); expect(first.status).toBe(200); const body = await first.json();
    expect(body).toMatchObject({ callSid, conferenceName: f.row.conference_id }); expect(await (await start(f)).json()).toEqual(body);
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
    const [row] = await sql`select source_call_sid, kind from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`;
    expect(row).toEqual({ source_call_sid: callSid, kind: 'customer' });
  });

  test("uncertain customer creation retains its hold and blocks repeated Start", async () => {
    const f = await scenario(); web.create.mockRejectedValueOnce(new Error('Lost provider reply before callbacks'));
    expect((await start(f)).status).toBe(409); await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    web.fetch.mockClear(); expect((await start(f)).status).toBe(409); expect(web.fetch).not.toHaveBeenCalled();
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
    const [r] = await sql`select state, provider_sid, send_started_at from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(r.state).toBe('creating'); expect(r.provider_sid).toBeNull(); expect(r.send_started_at).not.toBeNull();
  });

  test("accepted Start repairs a failed local recording part without another customer POST", async () => {
    const f = await scenario();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned predictive recording part fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.workspace_voice_recording_operation for each row execute function public.${fault}()`);
    const first = await start(f); expect(first.status).toBe(200); const body = await first.json();
    expect(await sql`select id from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`).toHaveLength(0);
    await clearFault(); expect(await (await start(f)).json()).toEqual(body); expect(web.create).toHaveBeenCalledTimes(1);
    expect(await sql`select source_call_sid from public.workspace_voice_recording_operation where workspace = ${workspaceId}::uuid`)
      .toEqual([{ source_call_sid: body.callSid }]);
  });

  test("the join checkpoint rejects a customer mode changed during source verification", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    rooms.participant.mockImplementation(async () => {
      await sql`update public.workspace_voice_reservation set audio_mode = 'manual' where provider_sid = ${callSid}`;
      return f.participant;
    });
    expect((await (await voice(url, callSid)).text())).not.toContain('<Conference');
    const [row] = await sql`select recipient_instruction_issued_at from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    expect(row.recipient_instruction_issued_at).toBeNull();
  });

  test("customer joins use the first phone callback and do not restamp the answer or close the room", async () => {
    const f = await scenario(), response = await start(f); expect(response.status).toBe(200); const { callSid } = await response.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required'); await voice(url, callSid);
    const [r] = await sql`select id, outreach_attempt_id from public.workspace_voice_reservation where provider_sid = ${callSid}`;
    const event = { AccountSid: accountSid, CallSid: callSid, ConferenceSid: f.row.conference_sid ?? '', FriendlyName: f.row.conference_id,
      ParticipantLabel: `customer:${r.id}`, StatusCallbackEvent: 'participant-join', Timestamp: new Date().toISOString() };
    expect((await signedAudio(f.row.conference_callback, event)).status).toBe(204);
    const [first] = await sql`select answered_at from public.outreach_attempt where id = ${r.outreach_attempt_id}`; expect(first.answered_at).not.toBeNull();
    const [queue] = await sql`select provider_status from public.campaign_queue where id =
      (select queue_id from public.workspace_voice_reservation where id = ${r.id}::uuid)`;
    expect(queue.provider_status).toBe('in-progress');
    expect((await signedAudio(f.row.conference_callback, event)).status).toBe(204);
    expect((await sql`select answered_at from public.outreach_attempt where id = ${r.outreach_attempt_id}`)[0]).toEqual(first);
    expect((await signedAudio(f.row.conference_callback, { ...event, StatusCallbackEvent: 'participant-leave', ReasonParticipantLeft: 'participant_hung_up' })).status).toBe(204);
    expect(rooms.update).not.toHaveBeenCalled(); expect(f.room.status).toBe('in-progress'); expect(await state()).toMatchObject({ ledger: 0, reservations: 1 });
  });

  test("a normal turn preserves fanout, recordings and the same phone for several customers", async () => {
    const f = await scenario(), first = await start(f); expect(first.status).toBe(200);
    const input = { user_id: actor, workspace_id: workspaceId, campaign_id: f.campaignId, conference_id: f.row.conference_id };
    expect(await runAutoDialerTurn(input)).toMatchObject({ success: true }); expect(await runAutoDialerTurn(input)).toMatchObject({ success: true });
    expect(web.create).toHaveBeenCalledTimes(3); expect(web.create.mock.calls.every(([args]) => args.to !== phone && args.record && args.machineDetection === 'Enable')).toBe(true);
    expect(await state()).toMatchObject({ reservations: 3, attempts: 3, ledger: 0, operations: 1, credits: 100 });
    expect(await runAutoDialerTurn(input)).toMatchObject({ success: true, message: 'No queued contacts' });
    expect(rooms.update).not.toHaveBeenCalled(); expect(f.room.status).toBe('in-progress');
  });

  test("removing an audio row cannot turn its saved predictive room into legacy dispatch", async () => {
    const f = await scenario(); expect((await start(f)).status).toBe(200);
    await sql`delete from public.workspace_voice_audio_connection where id = ${f.row.id}::uuid`;
    expect(await runAutoDialerTurn({ user_id: actor, workspace_id: workspaceId, campaign_id: f.campaignId,
      conference_id: f.row.conference_id })).toMatchObject({ success: false, failureKind: 'not-sent' });
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
  });

  test("a dropped machine response continues through the same journal and recorded customer owner", async () => {
    const f = await scenario(), first = await start(f); expect(first.status).toBe(200); const { callSid } = await first.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    expect((await voice(url, callSid, { AnsweredBy: 'machine_end_beep' })).status).toBe(200);
    const [operation] = await sql`select id, state from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    expect(operation.state).toBe('dropped');
    await expect(runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).resolves.toMatchObject({ completed: true });
    expect(await runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).toMatchObject({ completed: true, replay: true });
    expect(web.create).toHaveBeenCalledTimes(2); expect(web.create.mock.calls[1][0]).toMatchObject({ record: true, machineDetection: 'Enable' });
    const [saved] = await sql`select state, successor_call_sid from public.predictive_machine_operation where id = ${operation.id}::uuid`;
    expect(saved.state).toBe('continued'); expect(saved.successor_call_sid).not.toBe(callSid);
    const [part] = await sql`select source_call_sid from public.workspace_voice_recording_operation where source_call_sid = ${saved.successor_call_sid}`;
    expect(part.source_call_sid).toBe(saved.successor_call_sid); expect(await state()).toMatchObject({ reservations: 2, attempts: 2, operations: 1, ledger: 0 });
    expect(rooms.update).not.toHaveBeenCalled();
  });

  test("a continuation waits for a stopped source without claiming another contact", async () => {
    const f = await scenario(), first = await start(f); expect(first.status).toBe(200); const { callSid } = await first.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    await voice(url, callSid, { AnsweredBy: 'machine_end_beep' });
    const [operation] = await sql`select id from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await expect(runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).rejects.toThrow('not created');
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1, ledger: 0 });
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = null where id = ${f.row.id}::uuid`;
    expect(await runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).toMatchObject({ completed: true });
    expect(web.create).toHaveBeenCalledTimes(2); expect(rooms.update).not.toHaveBeenCalled();
  });

  test("a provider read failure leaves continuation unsent and ready to retry", async () => {
    const f = await scenario(), first = await start(f); expect(first.status).toBe(200); const { callSid } = await first.json();
    const url = web.records.get(callSid)?.voiceUrl; if (!url) throw new Error('Owned voice URL required');
    await voice(url, callSid, { AnsweredBy: 'machine_end_beep' });
    const [operation] = await sql`select id from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    web.fetch.mockRejectedValueOnce(new Error('Owned phone read outage'));
    await expect(runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).rejects.toThrow('not created');
    const [waiting] = await sql`select state, send_started_at from public.predictive_machine_operation where id = ${operation.id}::uuid`;
    expect(waiting).toEqual({ state: 'dropped', send_started_at: null });
    expect(web.create).toHaveBeenCalledTimes(1); expect(await state()).toMatchObject({ reservations: 1, attempts: 1 });
    await expect(runPredictiveMachineContinuation({ workspaceId, operationId: operation.id })).resolves.toMatchObject({ completed: true });
    expect(web.create).toHaveBeenCalledTimes(2);
  });
});
