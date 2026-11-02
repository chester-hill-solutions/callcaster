import { accountSid, actor, callerId, foreignId, journal, otherActor, otherPhone,
  phone, rooms, sid, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { confirmed, verified } from "../helpers/voice-audio-customer-fixture";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import { lockVerifiedVoiceAudioCustomerSource, readVoiceAudioCustomerSource } from "@/server/voice-audio-customer-source.server";
import { db } from "@/server/db";

describe("confirmed idle phone as a funded customer source", () => {
  useOwnedAudioFixture();

  test("observes the real phone and room without dialing, funding or queue work", async () => {
    const f = await confirmed(), before = await state();
    const proof = await verified(f);
    expect(proof).toMatchObject({ connectionId: f.row.id, generation: 1, callSid: f.call.sid, accountSid,
      conferenceId: f.row.conference_id, conferenceSid: f.room.sid, destination: phone, callerId,
      callbackUrl: f.row.conference_callback });
    expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, proof))).toMatchObject({ ok: true, connection: { id: f.row.id } });
    expect(rooms.participant).toHaveBeenCalledWith(f.room.sid, f.call.sid);
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
    expect(await state()).toEqual(before);
  });

  test.each([
    { workspaceId: foreignId }, { userId: otherActor }, { connectionId: randomUUID() },
  ])("does not expose another owner's connection for %j", async patch => {
    const f = await confirmed();
    expect(await verifyVoiceAudioCustomerSource({ ...f.input, ...patch })).toMatchObject({ ok: false });
    expect(web.fetch).not.toHaveBeenCalled(); expect(rooms.participant).not.toHaveBeenCalled();
  });

  test.each([{ generation: 2 }, { phoneNumber: otherPhone }])("rejects a stale requested source %j", async patch => {
    const f = await confirmed();
    expect(await readVoiceAudioCustomerSource({ ...f.input, ...patch })).toEqual({ ok: false, reason: "stale_audio" });
  });

  test.each(["prepared", "creating", "joining", "ready", "switching", "failed", "canceled", "retired"])("saved %s is not confirmed audio", async status => {
    const f = await confirmed();
    await sql`update public.workspace_voice_audio_connection set state = ${status} where id = ${f.row.id}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test.each(["committed_at", "voice_issued_at", "joined_at"])("requires saved %s before reading the provider", async field => {
    const f = await confirmed();
    await sql`update public.workspace_voice_audio_connection set ${sql(field)} = null where id = ${f.row.id}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test.each(["provider_sid", "conference_sid"])("the database forbids joined audio without %s", async field => {
    const f = await confirmed();
    await expect(sql`update public.workspace_voice_audio_connection set ${sql(field)} = null where id = ${f.row.id}::uuid`)
      .rejects.toMatchObject({ constraint_name: "voice_audio_join_identity" });
  });

  test.each(["cancel_requested_at", "terminal_at"])("saved %s fences a new customer", async field => {
    const f = await confirmed();
    await sql`update public.workspace_voice_audio_connection set ${sql(field)} = now() where id = ${f.row.id}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
  });

  test.each([false, true])("a saved room stop fences a customer, including confirmed stop=%s", async stopped => {
    const f = await confirmed();
    await sql`update public.workspace_voice_audio_connection set conference_stop_requested_at = now(),
      conference_stop_call_sid = ${f.call.sid}, conference_stopped_at = ${stopped ? new Date() : null} where id = ${f.row.id}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
  });

  test("current account rotation cannot adopt an old physical connection", async () => {
    const f = await confirmed();
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"9".repeat(32)}`, authToken: "replacement" })} where id = ${workspaceId}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "account_changed" });
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test("a removed verified number cannot authorize a new customer", async () => {
    const f = await confirmed();
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "device_not_verified" });
  });

  test.each([
    { sid: sid() }, { accountSid: `AC${"8".repeat(32)}` }, { status: "completed" }, { to: otherPhone },
    { from: otherPhone }, { direction: "outbound-dial" }, { parentCallSid: sid() },
  ])("rejects a physical phone with changed identity or status %j", async patch => {
    const f = await confirmed(); Object.assign(f.call, patch);
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
  });

  test.each([
    { sid: `CF${"7".repeat(32)}` }, { accountSid: `AC${"7".repeat(32)}` }, { friendlyName: "unowned-room" }, { status: "completed" },
  ])("rejects a physical room with changed identity or status %j", async patch => {
    const f = await confirmed(); Object.assign(f.room, patch);
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
  });

  test.each([
    { callSid: sid() }, { accountSid: `AC${"6".repeat(32)}` }, { conferenceSid: `CF${"6".repeat(32)}` },
    { label: "customer" }, { status: "disconnected" }, { muted: true }, { hold: true },
  ])("rejects a physical participant that cannot carry both directions %j", async patch => {
    const f = await confirmed(); Object.assign(f.participant, patch);
    expect(await verifyVoiceAudioCustomerSource(f.input)).toEqual({ ok: false, reason: "stale_audio" });
  });

  test("the provider client must still use the original account", async () => {
    const f = await confirmed(); web.accountSid = `AC${"5".repeat(32)}`;
    await expect(verifyVoiceAudioCustomerSource(f.input)).rejects.toThrow("original provider account");
    expect(web.fetch).not.toHaveBeenCalled();
  });

  test("a provider read failure cannot turn saved progress into permission", async () => {
    const f = await confirmed(); rooms.participant.mockRejectedValue(new Error("Participant lookup unavailable"));
    await expect(verifyVoiceAudioCustomerSource(f.input)).rejects.toThrow("Participant lookup unavailable");
    expect(web.create).not.toHaveBeenCalled();
  });

  test.each(["connectionId", "accountSid", "callSid", "conferenceId", "conferenceSid", "destination", "callerId", "callbackUrl"] as const)("rejects changed proof %s under the funding fence", async field => {
    const f = await confirmed(), proof = await verified(f);
    expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, { ...proof, [field]: "changed" }))).toEqual({ ok: false, reason: "stale_audio" });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("rejects invalid observation time %s", async observedAt => {
    const f = await confirmed(), proof = await verified(f);
    expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, { ...proof, observedAt }))).toEqual({ ok: false, reason: "stale_audio" });
  });

  test("five seconds expires the proof, including time spent waiting for the funding fence", async () => {
    const f = await confirmed(), proof = await verified(f);
    vi.spyOn(Date, "now").mockReturnValue(proof.observedAt + 5000);
    try {
      expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, proof))).toEqual({ ok: false, reason: "stale_audio" });
    } finally { vi.restoreAllMocks(); }
  });

  test("a future observation cannot extend permission", async () => {
    const f = await confirmed(), proof = await verified(f);
    vi.spyOn(Date, "now").mockReturnValue(proof.observedAt - 1);
    try {
      expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, proof))).toEqual({ ok: false, reason: "stale_audio" });
    } finally { vi.restoreAllMocks(); }
  });

  test("cancellation between provider reads and customer admission wins", async () => {
    const f = await confirmed(), proof = await verified(f);
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    expect(await db.transaction(tx => lockVerifiedVoiceAudioCustomerSource(tx, f.input, proof))).toEqual({ ok: false, reason: "stale_audio" });
    expect((await state()).reservations).toBe(0);
  });

  test("a late provider completion cannot refresh the expired read budget", async () => {
    const f = await confirmed();
    let finish: ((value: typeof f.participant) => void) | undefined;
    let entered: (() => void) | undefined;
    const started = new Promise<void>(resolve => { entered = resolve; });
    rooms.participant.mockImplementation(() => new Promise(resolve => { finish = resolve; entered?.(); }));
    const failure = expect(verifyVoiceAudioCustomerSource(f.input)).rejects.toThrow("Phone audio verification timed out");
    await started; await failure; finish?.(f.participant);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await state()).reservations).toBe(0); expect(web.create).not.toHaveBeenCalled();
  });

  test("concurrent source reads retain one audio owner and no customer side effects", async () => {
    const f = await confirmed(), before = await state();
    const results = await Promise.all(Array.from({ length: 20 }, () => verifyVoiceAudioCustomerSource(f.input)));
    expect(results.every(result => result.ok)).toBe(true);
    expect(await state()).toEqual(before); expect(web.create).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.state).toBe("active");
  });
});
