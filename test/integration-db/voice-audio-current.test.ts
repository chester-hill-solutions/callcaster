import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";
import { actor, apiPost, foreignId, funded, input, issued, joined, journal, otherActor, otherPhone, phone, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { issueVoiceAudioInstruction, observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";

async function current(query = "current=1", method = "GET", expectedActor = web.userId, workspace = workspaceId) {
  const request = new Request(`https://audio-connection.example.test/api/connect-phone-device?workspaceId=${workspace}&${query}`,
    { method, headers: { "X-Callcaster-Audio-Actor": expectedActor } });
  if (method === "GET") {
    const { loader } = await import("@/routes/api+/connect-phone-device.loader.server");
    return asRouteResponse(loader(routeArgs(request)));
  }
  const { action } = await import("@/routes/api+/connect-phone-device.action.server");
  return asRouteResponse(action(routeArgs(request)));
}

describe("current actor-owned audio recovery (#2879)", () => {
  useOwnedAudioFixture();

  test("an empty current read proves idle without creating a request or provider call", async () => {
    const before = await state(), response = await current();
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBe("audio-session=refreshed");
    await expect(response.json()).resolves.toEqual({ workspace_id: workspaceId, user_id: actor,
      active: null, pending: null, recovery_required: false, customer_pending: false });
    expect(await state()).toEqual(before);
    expect(web.create).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test("discovers the working phone and its current submitted control, without a second ring", async () => {
    const first = randomUUID(), next = randomUUID();
    const accepted = await (await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: first })).json();
    const row = await journal.findVoiceAudioConnection(accepted.connection_id);
    if (!row) throw new Error("Owned audio connection required");
    expect((await issueVoiceAudioInstruction(row, "1")).ok).toBe(true);
    await observeVoiceAudioConferenceEvent(joined(row));
    await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: next });
    const before = await state(), response = await current();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: { connection_intent_id: next, intent_state: "bound",
      request: { destination: phone, transport: "phone" },
      connection: { connection_id: row.id, connection_intent_id: first, control_intent_id: next, connection_state: "active" } },
    pending: null, recovery_required: false, customer_pending: false });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.update).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled();
    expect(await state()).toEqual(before);
  });

  test("returns both the working phone and its pending replacement", async () => {
    const old = await issued(); await observeVoiceAudioConferenceEvent(joined(old));
    const pending = await issued(input({ phoneNumber: otherPhone }));
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: { connection: { connection_id: old.id, connection_state: "active" } },
      pending: { connection: { connection_id: pending.id, connection_state: "joining" }, request: { destination: otherPhone } },
      recovery_required: false, customer_pending: false });
    expect(web.create).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test.each(["failed", "canceled", "retired"])("an unresolved %s provider leg blocks an idle claim", async terminalState => {
    const row = await issued();
    await sql`update public.workspace_voice_audio_connection set state = ${terminalState}, terminal_at = null where id = ${row.id}::uuid`;
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: null, pending: null, recovery_required: true });
    expect(web.update).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled();
  });

  test("a pending room stop remains visible after the phone is terminal", async () => {
    const row = await issued();
    await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace_voice_audio_connection set state = 'canceled', terminal_at = now(),
      conference_stop_requested_at = now(), conference_stop_call_sid = ${row.provider_sid}, conference_stopped_at = null where id = ${row.id}::uuid`;
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: null, pending: null, recovery_required: true });
    expect(web.update).not.toHaveBeenCalled();
  });

  test("an unresolved promotion blocks recovery even after its replacement phone ends", async () => {
    const target = await funded(), row = await issued(target.args);
    await sql`update public.workspace_voice_audio_connection set state = 'failed', terminal_at = now(),
      promotion_requested_at = now(), promotion_result = null where id = ${row.id}::uuid`;
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ recovery_required: true, customer_pending: true });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test("a funded customer without a browser journal prevents a second Start", async () => {
    await funded();
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: null, pending: null, recovery_required: false, customer_pending: true });
    expect(web.create).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled();
  });

  test("recovery retains an old-account phone after credentials and verification change", async () => {
    const row = await issued(); await observeVoiceAudioConferenceEvent(joined(row));
    await sql`update public.workspace set twilio_data = '{}'::jsonb, disabled = true where id = ${workspaceId}::uuid`;
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${actor}::uuid`;
    const response = await current(); expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ active: { connection: { connection_id: row.id, connection_state: "active" } } });
    expect(web.create).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test("another member cannot discover this agent's audio or customer", async () => {
    await issued(); await funded();
    const memberId = `audio-current:${workspaceId}:${otherActor}`;
    await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${otherActor}, 'caller')`;
    try {
      web.userId = otherActor;
      const response = await current(); expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ workspace_id: workspaceId, user_id: otherActor,
        active: null, pending: null, recovery_required: false, customer_pending: false });
    } finally { await sql`delete from public.workspace_member where id = ${memberId}`; }
  });

  test("a missing current intent is refused instead of reporting an idle agent", async () => {
    const row = await issued(); await observeVoiceAudioConferenceEvent(joined(row));
    await sql`delete from public.workspace_voice_audio_intent where workspace = ${workspaceId}::uuid and intent_id = ${row.intent_id}::uuid`;
    const response = await current(); expect(response.status).toBe(409);
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });

  test("authentication, expected actor and canonical membership precede discovery", async () => {
    web.authenticated = false; expect((await current()).status).toBe(401);
    web.authenticated = true; expect((await current("current=1", "GET", otherActor)).status).toBe(409);
    expect((await current("current=1", "GET", actor, foreignId)).status).toBe(404);
    expect(web.create).not.toHaveBeenCalled(); expect(web.fetch).not.toHaveBeenCalled();
  });

  test.each(["current=0", "current=true", "current=1&current=1", "current=1&unknown=1",
    `current=1&connection_id=${randomUUID()}`, `current=1&connection_intent_id=${randomUUID()}`])("rejects ambiguous current query %s", async query => {
    expect((await current(query)).status).toBe(400); expect(web.create).not.toHaveBeenCalled();
  });

  test.each(["current=1", ""])("DELETE cannot cancel an actor by workspace-only query %s", async query => {
    await issued(); const before = await state();
    expect((await current(query, "DELETE")).status).toBe(400);
    expect(await state()).toEqual(before); expect(web.update).not.toHaveBeenCalled();
  });
});
