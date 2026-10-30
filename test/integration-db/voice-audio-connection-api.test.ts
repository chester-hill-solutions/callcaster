import { useOwnedAudioFixture, accountSid, actor, apiControl, apiPost, callerId, claim, foreignId, funded, input, issued, joined, journal, otherActor, otherPhone, phone, prepare, rooms, sid, signedAudio, signedPredictive, sql, state, voiceParams, web, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { issueVoiceAudioInstruction, observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import { voiceAudioConferenceTwiml } from "@/lib/voice-audio-twiml.server";

describe("owned agent audio connection journal (#2879)", () => {
  useOwnedAudioFixture();

  test("accepted and answered are not a confirmed audio connection", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    expect(accepted.state).toBe("joining");
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    expect((await observeVoiceAudioStatus(accepted, "in-progress")).state).toBe("joining");
    const result = await issueVoiceAudioInstruction(accepted);
    expect(result).toMatchObject({ ok: true, connection: { state: "joining", committed_at: null } });
  });
  test("commits the first idle phone only after its owned conference join", async () => {
    const row = await issued(), before = await state(), event = joined(row);
    expect(await observeVoiceAudioConferenceEvent(event)).toMatchObject({ state: "active", conference_sid: event.conferenceSid });
    const connected = await journal.findVoiceAudioConnection(row.id);
    expect(connected?.joined_at).toBeInstanceOf(Date); expect(connected?.committed_at).toBeInstanceOf(Date);
    expect(await state()).toEqual(before);
    const xml = voiceAudioConferenceTwiml(row);
    expect(xml).toContain('endConferenceOnExit="false"'); expect(xml).toContain('muted="false"');
    expect(xml).toContain(`participantLabel="audio:${row.id}:1"`); expect(xml).toContain(`>${row.conference_id}</Conference>`);
    expect(xml).not.toContain("<Number"); expect(xml).not.toContain("record=");
  });
  test("joins a live replacement muted and keeps the original customer and hold", async () => {
    const target = await funded(), row = await issued(target.args), before = await state();
    expect(voiceAudioConferenceTwiml(row)).toContain('muted="true"');
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "ready", committed_at: null, source_agent_sid: target.parent });
    expect(await state()).toEqual(before);
    const [parent] = await sql`select status from public.call where sid = ${target.parent}`;
    expect(parent.status).toBe("in-progress");
  });
  test.each(["account", "room", "callback", "label", "mute", "conference SID"])("rejects a join with wrong %s", async (field) => {
    const row = await issued(), event = joined(row);
    if (field === "account") event.accountSid = `AC${"0".repeat(32)}`;
    if (field === "room") event.conferenceId = `${actor}~${randomUUID()}`;
    if (field === "callback") event.requestUrl += "&untrusted=1";
    if (field === "label") event.participantLabel = `audio:${row.id}:2`;
    if (field === "mute") event.muted = "true";
    if (field === "conference SID") await sql`update public.workspace_voice_audio_connection set conference_sid = ${`CF${"f".repeat(32)}`} where id = ${row.id}::uuid`;
    await expect(observeVoiceAudioConferenceEvent(event)).rejects.toThrow();
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "joining", joined_at: null, committed_at: null });
  });
  test("cannot attribute an unknown participant or a different workspace to the audio owner", async () => {
    const row = await issued();
    expect(await observeVoiceAudioConferenceEvent(joined(row, { callSid: sid() }))).toBeNull();
    expect(await observeVoiceAudioConferenceEvent(joined(row, { workspaceId: foreignId }))).toBeNull();
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("joining");
  });
  test("does not accept a conference participant before its saved voice instruction", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    await expect(observeVoiceAudioConferenceEvent(joined(accepted))).rejects.toThrow("does not match its conference");
  });
  test("duplicate conference joins retain the committed generation and timestamps", async () => {
    const row = await issued(), event = joined(row), first = await observeVoiceAudioConferenceEvent(event);
    expect(await observeVoiceAudioConferenceEvent(event)).toEqual(first);
  });
  test("a phone leave before its late join cannot reactivate the operation", async () => {
    const row = await issued(), event = joined(row);
    expect(await observeVoiceAudioConferenceEvent({ ...event, event: "participant-leave" })).toMatchObject({ state: "failed" });
    expect(await observeVoiceAudioConferenceEvent(event)).toMatchObject({ state: "failed", committed_at: null });
  });
  test("a canceled replacement cannot become effective on a late join", async () => {
    const row = await issued();
    const { cancelOwnedVoiceAudioConnection } = await import("@/server/voice-audio-lifecycle.server");
    await cancelOwnedVoiceAudioConnection({ workspaceId, userId: actor, connectionId: row.id });
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "joining", committed_at: null });
  });
  test("membership revocation between instruction and join prevents idle activation", async () => {
    const row = await issued(); await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "failed", committed_at: null });
  });
  test("a funded browser call started while the phone joins keeps its original audio", async () => {
    const row = await issued(), target = await funded();
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "failed", committed_at: null });
    const [customer] = await sql`select status, parent_call_sid from public.call where sid = ${target.child}`;
    expect(customer).toEqual({ status: "in-progress", parent_call_sid: target.parent });
    expect((await state()).reservations).toBe(1);
  });
  test("a funded browser call started before the phone answers prevents its first instruction", async () => {
    const row = await claim(await prepare()), accepted = await journal.recordVoiceAudioProvider(row, sid());
    await funded();
    expect(await issueVoiceAudioInstruction(accepted)).toEqual({ ok: false, reason: "stale_audio" });
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ voice_issued_at: null });
  });
  test("an already issued instruction replays its saved room before mutable device checks", async () => {
    const row = await issued();
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    await sql`update public.workspace_number set suspended_at = now() where workspace = ${workspaceId}::uuid`;
    const replay = await issueVoiceAudioInstruction(row);
    expect(replay).toMatchObject({ ok: true, replayed: true, connection: { id: row.id, conference_id: row.conference_id } });
  });
  test("a later phone joins through the first participant's callback without retiring the current phone", async () => {
    const first = await issued(), connected = await observeVoiceAudioConferenceEvent(joined(first));
    if (!connected) throw new Error("First audio participant required");
    const next = await issued(input({ phoneNumber: otherPhone }));
    expect(next.conference_callback).toBe(first.conference_callback);
    expect(voiceAudioConferenceTwiml(next)).toContain('muted="true"');
    expect(await observeVoiceAudioConferenceEvent(joined(next))).toMatchObject({ state: "ready", committed_at: null });
    expect((await journal.findVoiceAudioConnection(first.id))?.state).toBe("active");
    await sql`update public.workspace_voice_audio_connection set state = 'retired', retired_at = now() where id = ${first.id}::uuid`;
    expect(await observeVoiceAudioConferenceEvent(joined(connected, { event: "participant-leave" }))).toMatchObject({ state: "retired" });
    expect((await journal.findVoiceAudioConnection(next.id))?.state).toBe("ready");
  });
  test("the session API creates one connection-only leg and returns an owned pending snapshot", async () => {
    const response = await apiPost(); expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toBe("audio-session=refreshed");
    const body = await response.json(); expect(body).toMatchObject({ success: true, connection_state: "joining", generation: 1, transport: "phone", cancel_requested: false });
    const row = await journal.findVoiceAudioConnection(body.connection_id); if (!row) throw new Error("Saved API connection required");
    expect(web.create).toHaveBeenCalledExactlyOnceWith({ to: phone, from: callerId, url: row.voice_url, method: "POST",
      statusCallback: row.status_callback, statusCallbackMethod: "POST", statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] });
    expect((await apiControl(row)).status).toBe(200);
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, queue: 0, ledger: 0 });
    expect(row.conference_id).not.toContain("undefined");
  });
  test("concurrent session retries send at most one provider POST", async () => {
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const responses = await Promise.all(Array.from({ length: 8 }, () => apiPost(body)));
    expect(responses.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(responses.some((r) => r.status === 200)).toBe(true); expect(web.create).toHaveBeenCalledTimes(1);
    expect((await state()).operations).toBe(1);
  });
  test("POST, GET and DELETE retain the saved audio owner and request identity", async () => {
    const intent = randomUUID(), response = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    const body = await response.json(), row = await journal.findVoiceAudioConnection(body.connection_id);
    if (!row) throw new Error("Saved API connection required");
    const identity = { connection_id: row.id, workspace_id: workspaceId, user_id: actor, connection_intent_id: intent,
      destination: phone, requested_call_sid: null, campaign_id: null, generation: 1, transport: "phone", callSid: row.provider_sid };
    expect(body).toMatchObject(identity);
    await expect((await apiControl(row)).json()).resolves.toMatchObject(identity);
    await expect((await apiControl(row, "DELETE")).json()).resolves.toMatchObject({ ...identity, cancel_requested: true });
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("reusing a pending phone exposes its original intent rather than the new request UUID", async () => {
    const intent = randomUUID(), first = await (await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent })).json();
    const reused = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() });
    expect(reused.status).toBe(200);
    await expect(reused.json()).resolves.toMatchObject({ connection_id: first.connection_id, connection_intent_id: intent,
      workspace_id: workspaceId, user_id: actor, destination: phone, generation: 1, connection_state: "joining" });
    expect(web.create).toHaveBeenCalledTimes(1); expect((await state()).operations).toBe(1);
  });
  test("reusing an active phone retains its original identity without another provider create", async () => {
    const row = await issued();
    expect(await observeVoiceAudioConferenceEvent(joined(row))).toMatchObject({ state: "active" });
    const response = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, connection_id: row.id, connection_intent_id: row.intent_id,
      workspace_id: workspaceId, user_id: actor, destination: phone, callSid: row.provider_sid, generation: 1, connection_state: "active", cancel_requested: false });
    expect(web.create).not.toHaveBeenCalled(); expect((await state()).operations).toBe(1);
  });
  test("an account change after preparation exposes the owned unsent attempt for cancellation", async () => {
    const intent = randomUUID(), row = await prepare(input({ intentId: intent }));
    web.accountSid = `AC${"5".repeat(32)}`;
    const response = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    expect(response.status).toBe(409);
    expect(response.headers.get("Set-Cookie")).toBe("audio-session=refreshed");
    await expect(response.json()).resolves.toMatchObject({ reason: "account_changed", connection_id: row.id,
      workspace_id: workspaceId, user_id: actor, connection_intent_id: intent, destination: phone, connection_state: "prepared", callSid: null });
    const canceled = await apiControl(row, "DELETE"); expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_id: row.id, connection_state: "canceled", cancel_requested: true });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });
  test("API auth, tenant membership and device checks stop before provider create", async () => {
    web.authenticated = false; expect((await apiPost()).status).toBe(401);
    web.authenticated = true; web.userId = otherActor; expect((await apiPost()).status).toBe(404);
    web.userId = actor; expect((await apiPost({ workspaceId: foreignId, phoneNumber: phone })).status).toBe(404);
    expect((await apiPost({ workspaceId, phoneNumber: "+16135550777" })).status).toBe(403);
    expect(web.create).not.toHaveBeenCalled(); expect((await state()).operations).toBe(0);
  });
  test("the API preserves the uniform 402 body before a new idle connection", async () => {
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    const response = await apiPost(); expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({ error: "Insufficient credits", creditsError: true });
    expect(web.create).not.toHaveBeenCalled();
  });
  test("the API exposes uncertain creation without retrying the provider POST", async () => {
    web.create.mockRejectedValueOnce(Object.assign(new Error("Owned uncertain API response"), { status: 500 }));
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const first = await apiPost(body); expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({ reason: "voice_audio_pending", connection_state: "creating" });
    expect((await apiPost(body)).status).toBe(409); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("a late accepted API response honors cancellation instead of restoring audio", async () => {
    let entered: () => void = () => undefined, release: () => void = () => undefined;
    const posted = new Promise<void>((resolve) => { entered = resolve; }), acknowledged = new Promise<void>((resolve) => { release = resolve; });
    const create = web.create.getMockImplementation(); if (!create) throw new Error("Owned provider create required");
    web.create.mockImplementationOnce(async (...args) => { const physical = await create(...args); entered(); await acknowledged; return physical; });
    const intent = randomUUID(), sending = apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    await posted;
    let canceled: Response | undefined, response: Response | undefined, stopsBeforeAck = -1;
    try {
      const [record] = await sql`select id from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid and intent_id = ${intent}::uuid`;
      const row = await journal.findVoiceAudioConnection(record.id); if (!row) throw new Error("In-flight audio journal required");
      canceled = await apiControl(row, "DELETE"); stopsBeforeAck = web.update.mock.calls.length;
    } finally { release(); response = await sending; }
    if (!canceled || !response) throw new Error("Audio cancellation responses required");
    expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_state: "creating", cancel_requested: true });
    expect(stopsBeforeAck).toBe(0); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ connection_state: "canceled", cancel_requested: true });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.update).toHaveBeenCalledTimes(1);
  });
  test("a definite provider API refusal has a safe visible error and no uncertain retry", async () => {
    web.create.mockRejectedValueOnce(Object.assign(new Error("owned-provider-secret-marker"), { status: 400 }));
    const body = { workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() };
    const response = await apiPost(body); expect(response.status).toBe(502);
    const failure = await response.json();
    expect(failure).toMatchObject({ error: "Unable to connect the agent device", workspace_id: workspaceId, user_id: actor,
      connection_intent_id: body.connection_intent_id, destination: phone, connection_state: "failed", callSid: null });
    expect(JSON.stringify(failure)).not.toContain("owned-provider-secret-marker");
    const replay = await apiPost(body); expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ connection_id: failure.connection_id, connection_state: "failed", reason: "stale_audio" });
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("GET and DELETE are owned by the session and cannot end another user's audio", async () => {
    const response = await apiPost(), body = await response.json(), row = await journal.findVoiceAudioConnection(body.connection_id);
    if (!row) throw new Error("Saved API connection required");
    expect((await apiControl(row, "GET", foreignId)).status).toBe(404);
    web.userId = otherActor; expect((await apiControl(row)).status).toBe(404); expect((await apiControl(row, "DELETE")).status).toBe(404);
    expect(web.update).not.toHaveBeenCalled();
    web.userId = actor; const canceled = await apiControl(row, "DELETE"); expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_state: "canceled", cancel_requested: true });
    expect(web.update).toHaveBeenCalledExactlyOnceWith(row.provider_sid, { status: "canceled" });
  });
  test("a signed phone answer needs press 1 before the saved conference is issued", async () => {
    const row = await claim(await prepare()), params = voiceParams(row);
    const response = await signedAudio(row.voice_url, params), prompt = await response.text();
    expect(response.status).toBe(200); expect(prompt).toContain("<Gather"); expect(prompt).toContain('numDigits="1"'); expect(prompt).toContain("press 1");
    expect(prompt).not.toContain("<Conference"); expect((await journal.findVoiceAudioConnection(row.id))?.voice_issued_at).toBeNull();
    const confirmed = await signedAudio(row.voice_url, { ...params, Digits: "1" }), xml = await confirmed.text();
    expect(confirmed.status).toBe(200); expect(xml).toContain(`>${row.conference_id}</Conference>`); expect(xml).not.toContain("<Number");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: params.CallSid, state: "joining", committed_at: null });
  });
  test("a replacement account token cannot report an old audio leg's completion", async () => {
    const row = await claim(await prepare()), params = voiceParams(row);
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    const prior = await journal.findVoiceAudioConnection(row.id);
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"6".repeat(32)}`, authToken: "replacement-token" })}
      where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    expect((await signedAudio(row.status_callback, { ...params, CallStatus: "completed" }, true, { signingToken: "replacement-token" })).status).toBe(403);
    expect(await journal.findVoiceAudioConnection(row.id)).toEqual(prior);
  });
  test.each(["signature", "account", "destination", "sender", "direction", "parent", "callback", "alias", "duplicate"])(
    "the signed endpoint rejects changed %s before issuing audio", async (field) => {
      const row = await claim(await prepare()), params: Record<string, string> = voiceParams(row);
      if (field === "account") params.AccountSid = `AC${"0".repeat(32)}`;
      if (field === "destination") params.To = otherPhone;
      if (field === "sender") params.From = otherPhone;
      if (field === "direction") params.Direction = "inbound";
      if (field === "parent") params.ParentCallSid = sid();
      if (field === "alias") params.call_sid = sid();
      const url = field === "callback" ? row.voice_url + "&extra=1" : row.voice_url;
      const response = await signedAudio(url, params, field !== "signature", { extraFields: field === "duplicate" ? [["To", otherPhone]] : [] });
      expect(response.status).toBe(403);
      expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: null, voice_issued_at: null, committed_at: null });
    },
  );
  test("signed answered status cannot activate the transport; the owned join does", async () => {
    const row = await claim(await prepare()), params = voiceParams(row);
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("joining");
    expect((await signedAudio(row.voice_url, { ...params, Digits: "1" })).status).toBe(200);
    const event = { AccountSid: accountSid, CallSid: params.CallSid, FriendlyName: row.conference_id, ConferenceSid: `CF${randomUUID().replaceAll("-", "")}`,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-join" };
    expect((await signedAudio(row.conference_callback, event)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("active");
    expect(await state()).toMatchObject({ reservations: 0, ledger: 0, attempts: 0, queue: 0 });
  });
  test.each([false, true])("owned conference delivery retries failures with the saved signed URL, live=%s", async (live) => {
    const target = live ? await funded() : null, row = await claim(await prepare(target?.args)), params = voiceParams(row);
    const response = await signedAudio(row.voice_url, { ...params, Digits: "1" }); expect(response.status).toBe(200);
    const xml = await response.text(), callback = xml.match(/<Conference[^>]*statusCallback="([^"]+)"/);
    if (!callback) throw new Error("Conference callback required");
    const url = new URL(callback[1].replaceAll("&amp;", "&"));
    expect(url.hash).toBe("#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx");
    url.hash = ""; expect(url.href).toBe(row.conference_callback);
    const event = { AccountSid: accountSid, CallSid: params.CallSid, FriendlyName: row.conference_id,
      ConferenceSid: `CF${randomUUID().replaceAll("-", "")}`, ParticipantLabel: `audio:${row.id}:1`,
      Muted: String(live), StatusCallbackEvent: "participant-join" };
    expect((await signedAudio(url.href, event)).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe(live ? "ready" : "active");
  });
  test.each(["", "2", "11"])("an absent or wrong confirmation %s cannot join customer audio", async (digits) => {
    const row = await claim(await prepare()), params = { ...voiceParams(row), Digits: digits };
    const response = await signedAudio(row.voice_url, params), xml = await response.text();
    expect(response.status).toBe(200); expect(xml).toContain("<Hangup"); expect(xml).not.toContain("<Conference");
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ voice_issued_at: null, committed_at: null });
  });
  test("terminal signed audio status stays outside customer billing and outcomes", async () => {
    const row = await claim(await prepare()), params = { ...voiceParams(row), CallStatus: "completed", CallDuration: "61" };
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect((await signedAudio(row.status_callback, params)).status).toBe(204);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "failed", terminal_status: "completed" });
    expect(await state()).toMatchObject({ ledger: 0, attempts: 0, queue: 0, reservations: 0 });
  });
  test("the first funded conference callback accepts replacement audio without dispatching a customer", async () => {
    const target = await funded(true), row = await issued(target.args), before = await state();
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "true", StatusCallbackEvent: "participant-join" };
    const response = await signedPredictive(row.conference_callback, params); expect(response.status).toBe(200);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("ready");
    expect(web.create).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each(["label", "mute"])("the funded callback rejects a wrong replacement %s before participant work", async (field) => {
    const target = await funded(true), row = await issued(target.args);
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: field === "label" ? `audio:${row.id}:999` : `audio:${row.id}:1`, Muted: field === "mute" ? "false" : "true", StatusCallbackEvent: "participant-join" };
    expect((await signedPredictive(row.conference_callback, params)).status).toBe(403);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ state: "joining", joined_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test("a retired original browser cannot end the conference on its delayed leave", async () => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${row.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const params = { AccountSid: accountSid, CallSid: target.parent, FriendlyName: target.room, ConferenceSid: target.cf,
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, params)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect(rooms.records.get(target.cf)?.status).toBe("in-progress");
    const [customer] = await sql`select status from public.call where sid = ${target.child}`;
    expect(customer.status).toBe("in-progress"); expect((await state()).ledger).toBe(0);
  });
  test("an uncommitted replacement hangup keeps the existing customer conference", async () => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const event = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "true", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, event)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect(rooms.records.get(target.cf)?.status).toBe("in-progress");
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("failed");
  });
  test("a newer committed audio generation fences a late old phone leave before its retirement stamp", async () => {
    const target = await funded(true), first = await issued(target.args); await observeVoiceAudioConferenceEvent(joined(first));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${first.id}::uuid`;
    const next = await issued({ ...target.args, intentId: randomUUID(), phoneNumber: otherPhone, expectedAgentSid: first.provider_sid ?? "" });
    await observeVoiceAudioConferenceEvent(joined(next));
    await sql`update public.workspace_voice_audio_connection set state = 'failed' where id = ${first.id}::uuid`;
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${next.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const event = { AccountSid: accountSid, CallSid: first.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${first.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(first.conference_callback, event)).status).toBe(200);
    expect(rooms.update).not.toHaveBeenCalled(); expect((await journal.findVoiceAudioConnection(next.id))?.state).toBe("active");
  });
  test.each([false, true])("the current phone ends its conference even when terminal status arrives first: %s", async (statusFirst) => {
    const target = await funded(true), row = await issued(target.args);
    await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${row.id}::uuid`;
    rooms.records.set(target.cf, { sid: target.cf, accountSid, friendlyName: target.room, status: "in-progress" });
    const status = { ...voiceParams(row, row.provider_sid ?? ""), CallStatus: "completed", CallDuration: "61" };
    if (statusFirst) expect((await signedAudio(row.status_callback, status)).status).toBe(204);
    const event = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: target.room, ConferenceSid: target.cf,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedPredictive(row.conference_callback, event)).status).toBe(200);
    expect(rooms.update).toHaveBeenCalledExactlyOnceWith(target.cf, { status: "completed" });
    if (!statusFirst) expect((await signedAudio(row.status_callback, status)).status).toBe(204);
    expect((await state()).ledger).toBe(0);
    const [customer] = await sql`select status from public.call where sid = ${target.child}`;
    expect(customer.status).toBe("in-progress");
  });
  test("a provider stop failure on the current phone returns 500 for retry", async () => {
    const row = await issued(), event = joined(row); await observeVoiceAudioConferenceEvent(event);
    rooms.records.set(event.conferenceSid, { sid: event.conferenceSid, accountSid, friendlyName: row.conference_id, status: "in-progress" });
    rooms.update.mockRejectedValueOnce(new Error("Owned conference stop failure"));
    const params = { AccountSid: accountSid, CallSid: row.provider_sid ?? "", FriendlyName: row.conference_id, ConferenceSid: event.conferenceSid,
      ParticipantLabel: `audio:${row.id}:1`, Muted: "false", StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" };
    expect((await signedAudio(row.conference_callback, params)).status).toBe(500);
    expect((await signedAudio(row.conference_callback, params)).status).toBe(204);
    expect(rooms.records.get(event.conferenceSid)?.status).toBe("completed");
  });
});
