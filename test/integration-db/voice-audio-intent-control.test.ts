import { useOwnedAudioFixture, actor, apiPost, foreignId, funded, input, issued, journal, otherActor, phone, prepare, sql, state, web, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { asRouteResponse, routeArgs } from "../helpers/route-result";

async function control(intent: string, method = "GET", workspace = workspaceId, expectedActor?: string) {
  const request = new Request(`https://audio-connection.example.test/api/connect-phone-device?workspaceId=${workspace}&connection_intent_id=${intent}`,
    { method, headers: expectedActor !== undefined ? { "X-Callcaster-Audio-Actor": expectedActor } : undefined });
  if (method === "GET") {
    const { loader } = await import("@/routes/api+/connect-phone-device.loader.server");
    return asRouteResponse(loader(routeArgs(request)));
  }
  const { action } = await import("@/routes/api+/connect-phone-device.action.server");
  return asRouteResponse(action(routeArgs(request)));
}

describe("owned audio request controls (#2879)", () => {
  useOwnedAudioFixture();
  test("cancel before admission blocks every delayed POST without a provider call", async () => {
    const intent = randomUUID(), canceled = await control(intent, "DELETE");
    expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ workspace_id: workspaceId, user_id: actor,
      connection_intent_id: intent, intent_state: "canceled", request: null, connection: null });
    expect((await control(intent, "DELETE")).status).toBe(200);
    const response = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "intent_canceled" });
    await expect((await control(intent)).json()).resolves.toMatchObject({ intent_state: "canceled", connection: null });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
    const [row] = await sql`select count(*)::int as total from public.workspace_voice_audio_connection where workspace = ${workspaceId}::uuid`;
    expect(row.total).toBe(0);
  });
  test("intent reads recover a lost accepted reply without another create", async () => {
    const intent = randomUUID(); await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    const read = await control(intent); expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ workspace_id: workspaceId, user_id: actor, connection_intent_id: intent,
      intent_state: "bound", request: { transport: "phone", destination: phone, callSid: null, expectedAgentSid: null, campaignId: null },
      connection: { connection_state: "joining", control_intent_id: intent } });
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("an old canceled request cannot stop or reclaim a reused connection", async () => {
    const first = randomUUID(), next = randomUUID();
    const original = await (await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: first })).json();
    const adopted = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: next });
    expect(adopted.status).toBe(200);
    await expect(adopted.json()).resolves.toMatchObject({ connection_id: original.connection_id, connection_intent_id: first, control_intent_id: next });
    const before = await journal.findVoiceAudioConnection(original.connection_id);
    const canceled = await control(first, "DELETE"); expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ connection_intent_id: first, intent_state: "canceled", connection: null });
    expect(await journal.findVoiceAudioConnection(original.connection_id)).toEqual(before);
    expect((await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: first })).status).toBe(409);
    await expect((await control(next)).json()).resolves.toMatchObject({ intent_state: "bound", connection: { control_intent_id: next, cancel_requested: false } });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.update).not.toHaveBeenCalled();
  });
  test("cancel after preparation prevents its one-send checkpoint", async () => {
    const intent = randomUUID(), row = await prepare(input({ intentId: intent }));
    const canceled = await control(intent, "DELETE"); expect(canceled.status).toBe(200);
    await expect(canceled.json()).resolves.toMatchObject({ intent_state: "canceled", connection: { connection_id: row.id, connection_state: "canceled" } });
    const { claimVoiceAudioSend } = await import("@/server/voice-audio-connection.server");
    expect((await claimVoiceAudioSend(row)).ok).toBe(false); expect(web.create).not.toHaveBeenCalled();
  });
  test("reads and cancellations enforce the session owner before a saved intent", async () => {
    const intent = randomUUID(); await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    web.userId = otherActor;
    expect((await control(intent)).status).toBe(404); expect((await control(intent, "DELETE")).status).toBe(404);
    web.userId = actor;
    expect((await control(intent, "GET", foreignId)).status).toBe(404);
    expect((await control(intent, "DELETE", foreignId)).status).toBe(404);
    expect(web.update).not.toHaveBeenCalled();
    await expect((await control(intent)).json()).resolves.toMatchObject({ intent_state: "bound", connection: { cancel_requested: false } });
  });
  test("an unknown intent read has no provider or database side effects", async () => {
    expect((await control(randomUUID())).status).toBe(404);
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
    const [row] = await sql`select count(*)::int as total from public.workspace_voice_audio_intent where workspace = ${workspaceId}::uuid`;
    expect(row.total).toBe(0);
  });
  test("intent cancellation wins a lost provider acknowledgement without another POST", async () => {
    let entered = () => undefined, release = () => undefined;
    const started = new Promise<void>(resolve => { entered = resolve; }), reply = new Promise<void>(resolve => { release = resolve; });
    const create = web.create.getMockImplementation(); if (!create) throw new Error("Owned provider required");
    web.create.mockImplementationOnce(async (...args) => { const physical = await create(...args); entered(); await reply; return physical; });
    const intent = randomUUID(), sending = apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    await started;
    let canceled: Response | undefined, accepted: Response | undefined;
    try {
      canceled = await control(intent, "DELETE");
      expect(canceled.status).toBe(200);
      await expect(canceled.json()).resolves.toMatchObject({ intent_state: "canceled", connection: { connection_state: "creating", cancel_requested: true } });
      expect(web.update).not.toHaveBeenCalled();
    } finally { release(); accepted = await sending; }
    expect(accepted.status).toBe(200);
    await expect((await control(intent)).json()).resolves.toMatchObject({ intent_state: "canceled", connection: { connection_state: "canceled", cancel_requested: true } });
    expect(web.create).toHaveBeenCalledTimes(1); expect(web.update).toHaveBeenCalledTimes(1);
    expect(await state()).toMatchObject({ reservations: 0, attempts: 0, queue: 0, ledger: 0 });
  });
  test("a known connection rejects an older control intent for both read and cancel", async () => {
    const first = randomUUID(), next = randomUUID();
    const old = await (await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: first })).json();
    await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: next });
    const before = await journal.findVoiceAudioConnection(old.connection_id);
    for (const method of ["GET", "DELETE"]) {
      const request = new Request(`https://audio-connection.example.test/api/connect-phone-device?workspaceId=${workspaceId}&connection_id=${old.connection_id}&control_intent_id=${first}`, { method });
      const { loader } = await import("@/routes/api+/connect-phone-device.loader.server");
      const { action } = await import("@/routes/api+/connect-phone-device.action.server");
      const response = await asRouteResponse((method === "GET" ? loader : action)(routeArgs(request)));
      expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "stale_audio" });
    }
    expect(await journal.findVoiceAudioConnection(old.connection_id)).toEqual(before); expect(web.update).not.toHaveBeenCalled();
  });
  test("a conflicting retry cannot change the persisted request or its controls", async () => {
    const intent = randomUUID(); await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    const before = await (await control(intent)).json();
    const response = await apiPost({ workspaceId, phoneNumber: "+16135550602", connection_intent_id: intent });
    expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "intent_conflict" });
    await expect((await control(intent)).json()).resolves.toEqual(before); expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("an unfinished customer promotion refuses cancellation without marking its intent canceled", async () => {
    const target = await funded(), row = await issued(target.args);
    await sql`update public.workspace_voice_audio_connection set promotion_requested_at = now() where id = ${row.id}::uuid`;
    const before = await state(), response = await control(row.intent_id, "DELETE");
    expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "handoff_in_progress" });
    await expect((await control(row.intent_id)).json()).resolves.toMatchObject({ intent_state: "bound", connection: { cancel_requested: false } });
    expect(await state()).toEqual(before); expect(web.update).not.toHaveBeenCalled();
    const [customer] = await sql`select status from public.call where sid = ${target.child}`;
    expect(customer.status).toBe("in-progress");
  });
  test("same-workspace members can cancel only their own copy of a submitted UUID", async () => {
    const intent = randomUUID(); await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent });
    const memberId = `audio-intent:${workspaceId}:${otherActor}`;
    await sql`insert into public.workspace_member(id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${otherActor}, 'caller')`;
    try {
      web.userId = otherActor;
      expect((await control(intent)).status).toBe(404);
      const response = await control(intent, "DELETE"); expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ user_id: otherActor, connection_intent_id: intent, intent_state: "canceled", request: null, connection: null });
      web.userId = actor;
      await expect((await control(intent)).json()).resolves.toMatchObject({ user_id: actor, intent_state: "bound", connection: { cancel_requested: false } });
      expect(web.update).not.toHaveBeenCalled();
    } finally { web.userId = actor; await sql`delete from public.workspace_member where id = ${memberId}`; }
  });
  test("deleting a saved connection cannot make its old request create another phone", async () => {
    const intent = randomUUID(), first = await (await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent })).json();
    await sql`delete from public.workspace_voice_audio_connection where id = ${first.connection_id}::uuid`;
    await expect((await control(intent)).json()).resolves.toMatchObject({ intent_state: "superseded", connection: null });
    expect((await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent })).status).toBe(404);
    expect(web.create).toHaveBeenCalledTimes(1);
  });
  test("an old screen cannot act as the next signed-in user even when that user can call the same phone", async () => {
    const memberId = `audio-actor:${workspaceId}:${otherActor}`, intent = randomUUID();
    const [previous] = await sql<{ verified_audio_numbers: string[] | null }[]>`select verified_audio_numbers from public."user" where id = ${otherActor}::uuid`;
    await sql`insert into public.workspace_member(id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${otherActor}, 'caller')`;
    await sql`update public."user" set verified_audio_numbers = ${sql.array([phone])} where id = ${otherActor}::uuid`;
    try {
      web.userId = otherActor;
      const response = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: intent }, actor);
      expect(response.status).toBe(409); await expect(response.json()).resolves.toMatchObject({ reason: "stale_audio" });
      expect((await control(intent, "GET", workspaceId, actor)).status).toBe(409);
      expect((await control(intent, "DELETE", workspaceId, actor)).status).toBe(409);
      expect(await state()).toMatchObject({ operations: 0, reservations: 0, attempts: 0, ledger: 0 });
      const [count] = await sql`select count(*)::int as total from public.workspace_voice_audio_intent where workspace = ${workspaceId}::uuid`;
      expect(count.total).toBe(0); expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
      const current = await apiPost({ workspaceId, phoneNumber: phone, connection_intent_id: randomUUID() }, otherActor);
      expect(current.status).toBe(200); expect(web.create).toHaveBeenCalledTimes(1);
    } finally {
      web.userId = actor; await sql`delete from public.workspace_member where id = ${memberId}`;
      await sql`update public."user" set verified_audio_numbers = ${previous.verified_audio_numbers === null ? null : sql.array(previous.verified_audio_numbers)} where id = ${otherActor}::uuid`;
    }
  });
});
