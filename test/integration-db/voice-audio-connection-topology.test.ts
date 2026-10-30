import { useOwnedAudioFixture, accountSid, actor, ageRoomStop, apiPost, baseUrl, bridgeParams, claim, clearFault, endedReplacementFixture, failRoomStop, fault, funded, input, issued, joined, journal, markPromotionReady, otherActor, otherPhone, parentContinuationFixture, phone, prepare, rooms, sid, signedAudio, signedParent, sql, state, web, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { issueVoiceAudioInstruction, observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";

describe("owned agent audio connection journal (#2879)", () => {
  useOwnedAudioFixture();

  test("a terminal callback owner retains its room stop after status repair and worker restart", async () => {
    const f = await failRoomStop(), before = await state();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(f.row, "completed", "10"); await ageRoomStop(f.row);
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toEqual({ examined: 1, closed: 1, expired: 0, pending: 0 });
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ conference_stop_call_sid: f.target.parent,
      conference_stop_requested_at: expect.any(Date), conference_stopped_at: expect.any(Date), terminal_status: "completed" });
    expect(await state()).toEqual(before); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });
  test("a lost accepted room-stop reply is recovered without another provider update", async () => {
    const f = await endedReplacementFixture(), before = await state();
    rooms.update.mockImplementationOnce(async (id: string) => {
      const room = rooms.records.get(id); if (!room) throw new Error("Owned conference required");
      room.status = "completed"; throw new Error("Lost room-stop acknowledgement");
    });
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "customer", false))).status).toBe(500);
    await ageRoomStop(f.row); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect(rooms.update).toHaveBeenCalledOnce(); expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeInstanceOf(Date);
    expect(await state()).toEqual(before);
  });
  test("worker stop failures keep the room intent for a later retry", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row); rooms.update.mockRejectedValueOnce(new Error("Room stop still unavailable"));
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
    await ageRoomStop(f.row); expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 });
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
  });
  test.each(["sid", "accountSid", "friendlyName"])("room-stop recovery retains intent on a provider %s mismatch", async (field) => {
    const f = await failRoomStop(), room = rooms.records.get(f.conferenceSid); if (!room) throw new Error("Owned conference required");
    rooms.records.set(f.conferenceSid, { ...room, [field]: "foreign" }); rooms.update.mockClear(); await ageRoomStop(f.row);
    const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(rooms.update).not.toHaveBeenCalled(); expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
  });
  test("new audio intent cannot adopt an agent while its previous room stop is pending", async () => {
    const f = await failRoomStop();
    const response = await apiPost({ workspaceId, phoneNumber: phone, callSid: f.target.child,
      expected_agent_sid: f.target.parent, connection_intent_id: randomUUID() });
    expect(response.status).toBe(409); expect(web.create).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ operations: 1 });
  });
  test("a prepared replacement cannot send after the current room starts ending", async () => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    const next = await prepare({ ...f.target.args, intentId: randomUUID() });
    expect(next.id).not.toBe(f.row.id); expect(next.state).toBe("prepared");
    rooms.update.mockRejectedValueOnce(new Error("Owned room stop pending"));
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(await journal.claimVoiceAudioSend(next)).toEqual({ ok: false, reason: "connection_pending" });
    expect((await journal.findVoiceAudioConnection(next.id))?.send_started_at).toBeNull();
  });
  test("a saved room stop prevents the original parent from rejoining", async () => {
    const f = await failRoomStop(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup");
  });
  test("a room-stop checkpoint failure prevents provider I/O", async () => {
    const f = await endedReplacementFixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned room stop write fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before update of conference_stop_requested_at on public.workspace_voice_audio_connection
      for each row when (new.conference_stop_requested_at is not null) execute function public.${fault}()`);
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(rooms.fetch).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test("concurrent workers claim a terminal owner's pending room stop once", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row);
    const { claimVoiceAudioRecovery } = await import("@/server/voice-audio-lifecycle.server");
    const claims = await Promise.all(Array.from({ length: 3 }, () => claimVoiceAudioRecovery(1)));
    expect(claims.flat().map(r => r.id)).toEqual([f.row.id]);
  });
  test("an old stop lease cannot perform provider I/O after another worker claims it", async () => {
    const f = await failRoomStop(), old = await journal.findVoiceAudioConnection(f.row.id); if (!old) throw new Error("Saved stop required");
    await ageRoomStop(f.row); const { claimVoiceAudioRecovery } = await import("@/server/voice-audio-lifecycle.server");
    const [claimed] = await claimVoiceAudioRecovery(1); if (!claimed) throw new Error("Claimed stop required");
    rooms.fetch.mockClear(); rooms.update.mockClear(); const { attemptVoiceAudioConferenceStop } = await import("@/lib/voice-audio-stop.server");
    expect(await attemptVoiceAudioConferenceStop(old)).toBeNull(); expect(rooms.fetch).not.toHaveBeenCalled();
    expect(await attemptVoiceAudioConferenceStop(claimed)).toMatchObject({ conference_stopped_at: expect.any(Date) });
    expect(rooms.update).toHaveBeenCalledOnce();
  });
  test("a room acknowledgement write failure is recovered after the provider has stopped it", async () => {
    const f = await endedReplacementFixture();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned stop acknowledgement fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before update of conference_stopped_at on public.workspace_voice_audio_connection
      for each row when (new.conference_stopped_at is not null) execute function public.${fault}()`);
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    await clearFault(); await ageRoomStop(f.row); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, closed: 1 }); expect(rooms.update).toHaveBeenCalledOnce();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeInstanceOf(Date);
  });
  test("room-stop recovery cannot use API credentials for another account", async () => {
    const f = await failRoomStop(); await ageRoomStop(f.row); web.accountSid = `AC${randomUUID().replaceAll("-", "")}`;
    rooms.fetch.mockClear(); rooms.update.mockClear(); const { runVoiceAudioRecovery } = await import("@/lib/voice-audio-recovery.server");
    expect(await runVoiceAudioRecovery()).toMatchObject({ examined: 1, pending: 1 });
    expect(rooms.fetch).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stopped_at).toBeNull();
  });
  test("a room stop in flight blocks a concurrent new audio request", async () => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row); let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
    rooms.update.mockImplementationOnce(async (id: string) => {
      entered(); await blocked; const room = rooms.records.get(id); if (!room) throw new Error("Owned room required");
      room.status = "completed"; return room;
    });
    const pending = signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false));
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([started, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Owned conference stop did not reach provider I/O")), 3000);
      })]);
      expect((await apiPost({ workspaceId, phoneNumber: phone, callSid: f.target.child,
        expected_agent_sid: f.target.parent, connection_intent_id: randomUUID() })).status).toBe(409);
      expect(web.create).not.toHaveBeenCalled();
    } finally { clearTimeout(deadline); release(); expect((await pending).status).toBe(204); }
  });
  test("an accepted replacement cannot receive join instructions after a room stop starts", async () => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    const next = await claim(await prepare({ ...f.target.args, intentId: randomUUID() }));
    const accepted = await journal.recordVoiceAudioProvider(next, sid()); rooms.update.mockRejectedValueOnce(new Error("Room stop unavailable"));
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false))).status).toBe(500);
    expect(await issueVoiceAudioInstruction(accepted, "1")).toEqual({ ok: false, reason: "stale_audio" });
    expect((await journal.findVoiceAudioConnection(next.id))?.voice_issued_at).toBeNull();
    expect((await journal.findVoiceAudioConnection(next.id))?.cancel_requested_at).toBeInstanceOf(Date);
  });
  test("a late initial phone join cannot activate while an older idle room is ending", async () => {
    const first = await observeVoiceAudioConferenceEvent(joined(await issued())); if (!first?.conference_sid) throw new Error("Active idle phone required");
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server"); await observeVoiceAudioStatus(first, "completed", "10");
    const next = await issued();
    rooms.records.set(first.conference_sid, { sid: first.conference_sid, accountSid, friendlyName: first.conference_id, status: "in-progress" });
    rooms.update.mockRejectedValueOnce(new Error("Idle room stop unavailable"));
    expect((await signedAudio(first.conference_callback, { AccountSid: accountSid, CallSid: first.provider_sid ?? "", FriendlyName: first.conference_id,
      ConferenceSid: first.conference_sid, ParticipantLabel: `audio:${first.id}:${first.generation}`, Muted: "false",
      StatusCallbackEvent: "participant-leave", ReasonParticipantLeft: "participant_hung_up" })).status).toBe(500);
    expect(await observeVoiceAudioConferenceEvent(joined(next))).toMatchObject({ state: "failed", committed_at: null, cancel_requested_at: expect.any(Date) });
  });
  test.each([false, true])("an unresolved manual promotion blocks another intent after phone end=%s", async (ended) => {
    const f = ended ? await endedReplacementFixture() : await parentContinuationFixture();
    const before = await state(), result = await journal.prepareVoiceAudioConnection({ ...f.target.args, intentId: randomUUID() });
    expect(result).toEqual({ ok: false, reason: "connection_pending" }); expect(await state()).toEqual(before);
  });
  test("the same unresolved promotion intent still replays after its phone ends", async () => {
    const f = await endedReplacementFixture();
    expect(await journal.prepareVoiceAudioConnection(f.target.args)).toMatchObject({ ok: true, replayed: true, connection: { id: f.row.id } });
    expect(await state()).toMatchObject({ operations: 1 });
  });
  test("one agent's unresolved promotion does not block another verified workspace agent", async () => {
    await endedReplacementFixture();
    await sql`update public."user" set verified_audio_numbers = ${sql.array([phone])} where id = ${otherActor}::uuid`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`audio:${workspaceId}:${otherActor}`}, ${workspaceId}, ${otherActor}, 'caller') on conflict (id) do update set role_id = 'caller'`;
    const row = await prepare(input({ userId: otherActor })); expect(row).toMatchObject({ state: "prepared", user_id: otherActor, target_kind: "idle" });
    expect(await state()).toMatchObject({ operations: 2, reservations: 1, ledger: 0 });
  });
  test("a replacement after a failed phone reuses the verified canonical manual room", async () => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    const next = await prepare({ ...f.target.args, intentId: randomUUID(), phoneNumber: otherPhone });
    expect(next).toMatchObject({ state: "prepared", conference_id: f.row.conference_id, conference_sid: f.conferenceSid,
      conference_callback: f.row.conference_callback, source_agent_sid: f.target.parent, source_connection_id: null,
      customer_sid: f.target.child, generation: 2 });
    expect(next.id).not.toBe(f.row.id); expect(next.promotion_requested_at).toBeNull();
    const [original] = await sql`select r.conference_id, c.direction, c.parent_call_sid from public.workspace_voice_reservation r
      join public.call c on c.sid = r.provider_sid where r.id = ${f.target.id}::uuid`;
    expect(original).toEqual({ conference_id: null, direction: "outbound-dial", parent_call_sid: f.target.parent });
    expect(await state()).toMatchObject({ operations: 2, reservations: 1, ledger: 0 });
  });
  test.each(["conference_id", "conference_sid", "conference_callback"] as const)("an active source with the wrong %s cannot cross the canonical room", async (field) => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    const next = await issued({ ...f.target.args, intentId: randomUUID(), phoneNumber: otherPhone });
    const ready = await observeVoiceAudioConferenceEvent(joined(next)); if (!ready?.provider_sid) throw new Error("Joined current source required");
    await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${ready.id}::uuid`;
    const wrong = field === "conference_id" ? `${actor}~${randomUUID()}` : field === "conference_sid" ? `CF${randomUUID().replaceAll("-", "")}` : `${baseUrl}/foreign-callback`;
    await sql.unsafe(`update public.workspace_voice_audio_connection set ${field} = $1 where id = $2::uuid`, [wrong, ready.id]);
    const before = await state();
    expect(await journal.prepareVoiceAudioConnection({ ...f.target.args, expectedAgentSid: ready.provider_sid, intentId: randomUUID() }))
      .toEqual({ ok: false, reason: "stale_audio" });
    expect(await state()).toEqual(before);
  });
  test("a prepared phone cannot send after another promotion becomes unresolved", async () => {
    const target = await funded(), old = await observeVoiceAudioConferenceEvent(joined(await issued(target.args)));
    if (!old) throw new Error("Original ready phone required");
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server"); await observeVoiceAudioStatus(old, "completed", "10");
    const next = await prepare({ ...target.args, intentId: randomUUID() }); expect(next.state).toBe("prepared");
    await sql`update public.workspace_voice_audio_connection set promotion_requested_at = now() where id = ${old.id}::uuid`;
    expect(await journal.claimVoiceAudioSend(next)).toEqual({ ok: false, reason: "connection_pending" });
    expect((await journal.findVoiceAudioConnection(next.id))?.send_started_at).toBeNull();
  });
  test.each(["account", "actor", "customer", "parent", "joins"])("canonical manual room refuses a wrong %s binding", async (field) => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    if (field === "account") await sql`update public.workspace_voice_audio_connection set account_sid = ${`AC${randomUUID().replaceAll("-", "")}`} where id = ${f.row.id}::uuid`;
    if (field === "actor") await sql`update public.workspace_voice_audio_connection set user_id = ${otherActor} where id = ${f.row.id}::uuid`;
    if (field === "customer") await sql`update public.workspace_voice_audio_connection set customer_sid = ${sid()} where id = ${f.row.id}::uuid`;
    if (field === "parent") await sql`update public.workspace_voice_audio_connection set original_agent_sid = ${sid()} where id = ${f.row.id}::uuid`;
    if (field === "joins") await sql`update public.workspace_voice_audio_connection set customer_joined_at = null where id = ${f.row.id}::uuid`;
    const before = await state(), result = await journal.prepareVoiceAudioConnection({ ...f.target.args, intentId: randomUUID() });
    expect(result).toEqual({ ok: false, reason: "stale_audio" }); expect(await state()).toEqual(before);
  });
  test("a closed manual topology cannot create another room while customer status is delayed", async () => {
    const f = await endedReplacementFixture(); await sql`update public.workspace_voice_audio_connection set promotion_result = 'closed' where id = ${f.row.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection({ ...f.target.args, intentId: randomUUID() })).toEqual({ ok: false, reason: "target_inactive" });
    expect(await state()).toMatchObject({ operations: 1 });
  });
  test.each(["rejected", "closed"])("a %s promotion cannot return the parent to its conference", async (result) => {
    const f = await endedReplacementFixture(); await sql`update public.workspace_voice_audio_connection set promotion_result = ${result} where id = ${f.row.id}::uuid`;
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup");
  });
  test("a positively rejected promotion leaves the original call eligible for a new room", async () => {
    const f = await endedReplacementFixture(); await sql`update public.workspace_voice_audio_connection set promotion_result = 'rejected' where id = ${f.row.id}::uuid`;
    const next = await prepare({ ...f.target.args, intentId: randomUUID() });
    expect(next.conference_id).not.toBe(f.row.conference_id); expect(next.conference_sid).toBeNull();
    expect(next.source_agent_sid).toBe(f.target.parent); expect(await state()).toMatchObject({ reservations: 1, ledger: 0 });
  });
  test("a verified room stop closes its canonical manual topology before a new audio request", async () => {
    const f = await endedReplacementFixture(); await markPromotionReady(f.row);
    expect((await signedAudio(f.row.conference_callback, bridgeParams(f, "customer", false))).status).toBe(204);
    expect((await journal.findVoiceAudioConnection(f.row.id))?.promotion_result).toBe("closed");
    expect(await journal.prepareVoiceAudioConnection({ ...f.target.args, intentId: randomUUID() })).toEqual({ ok: false, reason: "target_inactive" });
  });
  test.each([
    { result: null, constraint: "voice_audio_unresolved_promotion" }, { result: "ready", constraint: "voice_audio_canonical_manual_room" },
  ])("the database rejects a second $result manual topology owner", async ({ result, constraint }) => {
    const f = await endedReplacementFixture(); if (result === "ready") await markPromotionReady(f.row);
    const id = randomUUID(), overrides = { id, intent_id: randomUUID(), generation: f.row.generation + 1, provider_sid: sid(),
      conference_id: `${actor}~${randomUUID()}`, conference_sid: `CF${randomUUID().replaceAll("-", "")}`,
      voice_url: `${baseUrl}/api/voice-audio?connection=${id}&event=voice`,
      status_callback: `${baseUrl}/api/voice-audio?connection=${id}&event=status`,
      conference_callback: `${baseUrl}/api/voice-audio?connection=${id}&event=conference` };
    await expect(sql`insert into public.workspace_voice_audio_connection
      select (jsonb_populate_record(null::public.workspace_voice_audio_connection, to_jsonb(prior) || ${sql.json(overrides)}::jsonb)).*
      from public.workspace_voice_audio_connection prior where prior.id = ${f.row.id}::uuid`).rejects.toMatchObject({ code: "23505", constraint_name: constraint });
    expect(await state()).toMatchObject({ operations: 1, reservations: 1, ledger: 0 });
  });
});
