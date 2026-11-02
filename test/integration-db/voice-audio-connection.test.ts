import { useOwnedAudioFixture, accountSid, actor, baseUrl, callerId, claim, clearFault, deny, dispatch, fault, foreignId, funded, input, journal, otherActor, otherPhone, phone, prepare, receipt, refusals, sid, sql, state, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { isVoiceAudioLeg } from "@/server/voice-audio-classification.server";
import { bindVoiceAudioProviderReceipt } from "@/server/voice-audio-callback.server";

describe("owned agent audio connection journal (#2879)", () => {
  useOwnedAudioFixture();


  test("prepares an idle connection without claiming a contact, a customer hold or a debit", async () => {
    const row = await prepare();
    expect(row).toMatchObject({ state: "prepared", target_kind: "idle", generation: 1, destination: phone, account_sid: accountSid,
      customer_sid: null, reservation_id: null, provider_sid: null, send_started_at: null });
    expect(row.conference_id).toMatch(new RegExp(`^${actor}~`));
    expect(await state()).toEqual({ credits: 100, operations: 1, reservations: 0, ledger: 0, attempts: 0, queue: 0 });
  });
  test("normalizes a verified destination before saving it", async () => {
    expect((await prepare(input({ phoneNumber: ` ${phone} ` }))).destination).toBe(phone);
  });
  test.each(["owner", "admin", "member", "caller"])("permits the existing %s workspace role", async (role) => {
    await sql`update public.workspace_member set role_id = ${role} where workspace_id = ${workspaceId}`;
    expect((await prepare()).user_id).toBe(actor);
  });
  test("replays one intent and refuses a changed destination under that intent", async () => {
    const args = input(), row = await prepare(args);
    expect(await journal.prepareVoiceAudioConnection(args)).toMatchObject({ ok: true, replayed: true, connection: { id: row.id } });
    expect(await journal.prepareVoiceAudioConnection({ ...args, phoneNumber: otherPhone })).toEqual({ ok: false, reason: "intent_conflict" });
    expect((await state()).operations).toBe(1);
  });
  test("legacy idle retries reuse a pending connection without an intent from the client", async () => {
    const row = await prepare();
    expect(await journal.prepareVoiceAudioConnection(input())).toMatchObject({ ok: true, replayed: true, connection: { id: row.id } });
  });
  test("a different replacement cannot bypass an existing pending attempt", async () => {
    await prepare();
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toEqual({ ok: false, reason: "connection_pending" });
  });
  test.each(["failed", "canceled", "retired"])("a nonterminal %s leg must finish cleanup before another phone can ring", async (audioState) => {
    const row = await claim(await prepare()), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.workspace_voice_audio_connection set state = ${audioState} where id = ${row.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toEqual({ ok: false, reason: "connection_pending" });
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    const accepted = await journal.findVoiceAudioConnection(row.id); if (!accepted) throw new Error("Accepted audio operation required");
    await observeVoiceAudioStatus(accepted, "completed", "0");
    expect(await journal.prepareVoiceAudioConnection(input({ phoneNumber: otherPhone }))).toMatchObject({ ok: true, connection: { generation: 2 } });
  });
  test("concurrent retries create and send one physical agent leg", async () => {
    const args = input();
    const rows = await Promise.all(Array.from({ length: 8 }, () => prepare(args)));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    const providerSid = sid(), create = vi.fn(async () => ({ sid: providerSid }));
    await Promise.all(rows.map((r) => dispatch.dispatchVoiceAudioConnection(r, create)));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await journal.findVoiceAudioConnection(rows[0].id)).toMatchObject({ provider_sid: providerSid, state: "joining" });
    expect((await state()).reservations).toBe(0);
  });
  test.each(refusals)("refuses %s before saving a provider send", async (kind, reason) => {
    expect(await journal.prepareVoiceAudioConnection(await deny(kind, input()))).toEqual({ ok: false, reason });
    expect((await state()).operations).toBe(0);
  });
  test("held customer credits cannot fund a new idle connection", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set user_id = ${otherActor} where id = ${target.id}::uuid`;
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(input())).toEqual({ ok: false, reason: "insufficient_credits" });
  });
  test("an idle connection cannot replace audio for the actor's funded browser call", async () => {
    await funded();
    expect(await journal.prepareVoiceAudioConnection(input())).toEqual({ ok: false, reason: "stale_audio" });
    expect((await state()).operations).toBe(0);
  });
  test("replaces a funded customer's audio at zero available balance without a second hold", async () => {
    const target = await funded();
    await sql`update public.workspace set credits = 0 where id = ${workspaceId}::uuid`;
    const before = await state(), row = await prepare(target.args);
    expect(row).toMatchObject({ target_kind: "direct", customer_sid: target.child, reservation_id: target.id, source_agent_sid: target.parent });
    await dispatch.dispatchVoiceAudioConnection(row, async () => ({ sid: sid() }));
    expect(await state()).toEqual({ ...before, operations: 1 });
  });
  test("keeps an old manual call's audio when no parent continuation was saved", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set setup_continuation_url = null where id = ${target.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "handoff_unavailable" });
  });
  test("rejects a stale source agent SID", async () => {
    const target = await funded();
    expect(await journal.prepareVoiceAudioConnection({ ...target.args, expectedAgentSid: sid() })).toEqual({ ok: false, reason: "stale_audio" });
  });
  test("cannot replace a different agent's funded customer", async () => {
    const target = await funded();
    await sql`update public.workspace_voice_reservation set user_id = ${otherActor} where id = ${target.id}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "target_not_found" });
  });
  test("cannot move a terminal customer into a new audio connection", async () => {
    const target = await funded();
    await sql`update public.call set status = 'completed' where sid = ${target.child}`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "target_inactive" });
  });
  test("does not send an original-account call through changed workspace credentials", async () => {
    const target = await funded();
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"9".repeat(32)}`, authToken: "owned-changed-token" })} where id = ${workspaceId}::uuid`;
    expect(await journal.prepareVoiceAudioConnection(target.args)).toEqual({ ok: false, reason: "account_changed" });
  });
  test("uses the original conference callback and generation for an existing conference", async () => {
    const target = await funded(true), row = await prepare(target.args);
    expect(row).toMatchObject({ target_kind: "conference", conference_id: target.room, conference_sid: target.cf });
    const url = new URL(row.conference_callback);
    expect(url.pathname).toBe("/api/auto-dial/status");
    expect(url.searchParams.get("credit_reservation")).toBe(target.id);
    expect(url.searchParams.get("conference_events")).toBe("1");
    expect(url.searchParams.has("credit_leg")).toBe(false);
  });
  test("derives the computer destination from the funded agent identity", async () => {
    const target = await funded();
    const row = await prepare({ ...target.args, transport: "computer", phoneNumber: undefined });
    expect(row.destination).toBe(`client:${actor}`);
  });
  test.each(["missing", "foreign", "expired", "valid"])("checks a saved handset client identity with a %s session", async (mode) => {
    const target = await funded(), identity = `handset-${randomUUID()}`;
    await sql`update public.workspace_voice_reservation set setup_client_identity = ${identity} where id = ${target.id}::uuid`;
    if (mode !== "missing") await sql`insert into public.handset_session (id, workspace_id, user_id, client_identity, status, expires_at)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${mode === "foreign" ? otherActor : actor}, ${identity}, 'active',
        ${new Date(Date.now() + (mode === "expired" ? -60_000 : 60_000))})`;
    const result = await journal.prepareVoiceAudioConnection({ ...target.args, transport: "computer", phoneNumber: undefined });
    if (mode === "valid") expect(result).toMatchObject({ ok: true, connection: { destination: `client:${identity}` } });
    else expect(result).toEqual({ ok: false, reason: "device_not_verified" });
  });
  test.each(["removed membership", "disabled user", "disabled workspace", "unverified phone", "suspended caller ID", "zero idle credits"])(
    "rechecks %s after preparation and before the provider POST", async (kind) => {
      const row = await prepare();
      if (kind === "unverified phone") await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
      else await deny(kind, input());
      const create = vi.fn(async () => ({ sid: sid() }));
      expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toMatchObject({ ok: false });
      expect(create).not.toHaveBeenCalled();
      expect((await journal.findVoiceAudioConnection(row.id))?.send_started_at).toBeNull();
    },
  );
  test("an expired unsent lease cannot issue a provider call", async () => {
    const row = await prepare();
    await sql`update public.workspace_voice_audio_connection set lease_expires_at = now() - interval '1 minute' where id = ${row.id}::uuid`;
    const create = vi.fn(async () => ({ sid: sid() }));
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).not.toHaveBeenCalled();
  });
  test.each([400, 403, 429])("a definite provider %s rejection fails this attempt without billing", async (status) => {
    const row = await prepare(), failure = Object.assign(new Error("Owned provider rejection"), { status });
    const create = vi.fn(async () => { throw failure; });
    await expect(dispatch.dispatchVoiceAudioConnection(row, create)).rejects.toBe(failure);
    expect((await journal.findVoiceAudioConnection(row.id))?.state).toBe("failed");
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).toHaveBeenCalledTimes(1);
    expect((await state()).ledger).toBe(0);
  });
  test.each([408, 500, undefined])("provider %s uncertainty never repeats creation", async (status) => {
    const row = await prepare(), failure = Object.assign(new Error("Owned uncertain response"), { status });
    const create = vi.fn(async () => { throw failure; });
    await expect(dispatch.dispatchVoiceAudioConnection(row, create)).rejects.toBeInstanceOf(dispatch.VoiceAudioConnectionPendingError);
    const saved = await journal.findVoiceAudioConnection(row.id);
    expect(saved).toMatchObject({ state: "creating", provider_sid: null, last_error: "Agent audio creation or acknowledgement needs recovery" });
    expect(saved?.send_started_at).toBeInstanceOf(Date);
    expect(await journal.prepareVoiceAudioConnection(input())).toMatchObject({ ok: true, connection: { id: row.id } });
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "connection_pending" });
    expect(create).toHaveBeenCalledTimes(1);
  });
  test("an early provider receipt survives a lost create response", async () => {
    const row = await prepare(), providerSid = sid();
    const result = await dispatch.dispatchVoiceAudioConnection(row, async (started) => {
      await journal.recordVoiceAudioProvider(started, providerSid);
      throw new Error("Owned lost response after webhook receipt");
    });
    expect(result).toMatchObject({ ok: true, replayed: true, connection: { provider_sid: providerSid } });
  });
  test("call-row repair failure preserves the accepted SID and its audio classification", async () => {
    const row = await prepare(), providerSid = sid();
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
      if new.workspace = '${workspaceId}'::uuid then raise exception 'owned audio receipt fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.call for each row execute function public.${fault}()`);
    const result = await dispatch.dispatchVoiceAudioConnection(row, async () => ({ sid: providerSid }));
    expect(result).toMatchObject({ ok: true, connection: { provider_sid: providerSid } });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
    expect(await isVoiceAudioLeg(foreignId, providerSid)).toBe(false);
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: providerSid, last_error: "Accepted audio call record needs recovery" });
    await clearFault();
    await journal.recordVoiceAudioProvider(row, providerSid);
    const [call] = await sql`select sid, contact_id, outreach_attempt_id, queue_id from public.call where sid = ${providerSid}`;
    expect(call).toEqual({ sid: providerSid, contact_id: null, outreach_attempt_id: null, queue_id: null });
  });
  test("a provider SID cannot be rebound to another accepted leg", async () => {
    const row = await claim(await prepare()), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await expect(journal.recordVoiceAudioProvider(row, sid())).rejects.toThrow("does not match its send");
    expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBe(providerSid);
  });
  test.each(["voice", "status"] as const)("binds an early %s receipt only to its saved send", async (event) => {
    const row = await claim(await prepare()), providerSid = sid();
    const bound = await bindVoiceAudioProviderReceipt(receipt(row, { event, requestUrl: event === "voice" ? row.voice_url : row.status_callback, callSid: providerSid }));
    expect(bound).toMatchObject({ id: row.id, provider_sid: providerSid, state: "joining" });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
  });
  test.each([
    { accountSid: `AC${"0".repeat(32)}` }, { to: otherPhone }, { from: otherPhone },
    { direction: "inbound" }, { direction: "outbound-dial" }, { parentCallSid: sid() },
    { requestUrl: `${baseUrl}/api/voice-audio?event=status&connection=unknown` },
    { event: "voice" as const }, { callSid: "not-a-provider-sid" },
  ])("rejects a provider receipt with changed identity %#", async (overrides) => {
    const row = await claim(await prepare());
    await expect(bindVoiceAudioProviderReceipt(receipt(row, overrides))).rejects.toThrow();
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: null, state: "creating" });
    const [calls] = await sql`select count(*)::int as count from public.call where workspace = ${workspaceId}::uuid`;
    expect(calls.count).toBe(0);
  });
  test("does not accept a provider receipt before the before-send checkpoint", async () => {
    const row = await prepare();
    await expect(bindVoiceAudioProviderReceipt(receipt(row))).rejects.toThrow("does not match its send");
    expect((await journal.findVoiceAudioConnection(row.id))?.provider_sid).toBeNull();
  });
  test("membership removal after send cannot erase a real accepted receipt", async () => {
    const row = await claim(await prepare()), providerSid = sid();
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
    expect(await bindVoiceAudioProviderReceipt(receipt(row, { callSid: providerSid }))).toMatchObject({ provider_sid: providerSid });
    expect(await isVoiceAudioLeg(workspaceId, providerSid)).toBe(true);
    expect((await state()).ledger).toBe(0);
  });
  test("a failed attempt retains its generation while a new intent uses the next generation", async () => {
    const row = await claim(await prepare());
    await journal.failUnacceptedVoiceAudio(row);
    const next = await prepare();
    expect(next.generation).toBe(2);
    expect(next.id).not.toBe(row.id);
    const providerSid = sid();
    await bindVoiceAudioProviderReceipt(receipt(row, { callSid: providerSid }));
    expect(await journal.findVoiceAudioConnection(row.id)).toMatchObject({ provider_sid: providerSid, state: "failed", generation: 1 });
    expect(await journal.findVoiceAudioConnection(next.id)).toMatchObject({ provider_sid: null, state: "prepared", generation: 2 });
  });
  test("rechecks a funded customer terminal transition immediately before send", async () => {
    const target = await funded(), row = await prepare(target.args);
    await sql`update public.call set status = 'completed' where sid = ${target.child}`;
    const create = vi.fn(async () => ({ sid: sid() }));
    expect(await dispatch.dispatchVoiceAudioConnection(row, create)).toEqual({ ok: false, reason: "target_inactive" });
    expect(create).not.toHaveBeenCalled();
  });
  test("keeps the existing fallback caller ID when no handset number is selected", async () => {
    await sql`update public.workspace_number set handset_enabled = false where workspace = ${workspaceId}::uuid`;
    expect((await prepare()).caller_id).toBe(callerId);
  });
  test.each(["joining", "active", "retired", "failed", "canceled"])("a %s audio leg cannot bill or write customer outcomes", async (audioState) => {
    const target = await funded(), row = await claim(await prepare(target.args)), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.workspace_voice_audio_connection set state = ${audioState} where id = ${row.id}::uuid`;
    await sql`update public.call set status = 'completed', duration = '42' where sid = ${providerSid}`;
    const before = await state();
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const { runCallStatusSideEffects } = await import("@/lib/worker/webhook-side-effects.server");
    const { parseTwilioVoiceCallback } = await import("@/lib/twilio/voice-callback");
    const saved = await findCallBySid(providerSid);
    if (!saved) throw new Error("Accepted audio call row required");
    expect(await billTerminalCallStatus(saved)).toBeNull();
    const event = parseTwilioVoiceCallback({ AccountSid: accountSid, CallSid: providerSid, CallStatus: "completed", CallDuration: "42" });
    await runCallStatusSideEffects({ callSid: providerSid, event });
    await runCallStatusSideEffects({ callSid: providerSid, event });
    expect(await state()).toEqual(before);
    const [customerHold] = await sql`select state from public.workspace_voice_reservation where id = ${target.id}::uuid`;
    expect(customerHold.state).toBe("active");
    const [jobs] = await sql`select count(*)::int as count from public.job where workspace_id = ${workspaceId}::uuid`;
    expect(jobs.count).toBe(0);
  });
  test("the funded customer still settles once while its replacement audio is excluded", async () => {
    const target = await funded(), row = await claim(await prepare(target.args)), providerSid = sid();
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`update public.call set status = 'completed', duration = '42' where sid in (${providerSid}, ${target.child})`;
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const audio = await findCallBySid(providerSid), customerCall = await findCallBySid(target.child);
    if (!audio || !customerCall) throw new Error("Owned calls required");
    for (let n = 0; n < 2; n++) { await billTerminalCallStatus(audio); await billTerminalCallStatus(customerCall); }
    expect(await state()).toMatchObject({ credits: 96, ledger: 1, reservations: 1 });
    const [entry] = await sql`select call_sid, amount from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(entry.call_sid).toBe(target.child);
    expect(Number(entry.amount)).toBe(-4);
  });
  test("excludes audio before a limited legacy recovery query while preserving an unfunded control", async () => {
    const row = await claim(await prepare());
    const providerSid = `CAf${randomUUID().replaceAll("-", "").slice(1)}`;
    const legacySid = `CA0${randomUUID().replaceAll("-", "").slice(1)}`;
    await journal.recordVoiceAudioProvider(row, providerSid);
    await sql`insert into public.call (sid, workspace, account_sid, status, direction) values
      (${legacySid}, ${workspaceId}::uuid, ${accountSid}, 'in-progress', 'outbound-api')`;
    const { db } = await import("@/server/db");
    const { call } = await import("@/db/schema");
    const { and, eq, desc } = await import("drizzle-orm");
    const { unreservedVoiceCallPredicate } = await import("@/server/voice-bridge-reservation.server");
    const rows = await db.select({ sid: call.sid }).from(call).where(and(eq(call.workspace, workspaceId),
      unreservedVoiceCallPredicate(workspaceId))).orderBy(desc(call.sid)).limit(1);
    expect(rows).toEqual([{ sid: legacySid }]);
  });
});
