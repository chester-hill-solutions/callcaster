import { accountSid, actor, callerId, customer, otherPhone, phone, sid, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { confirmed, verified } from "../helpers/voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { recordVoiceReservationProvider, replayVoiceOperation, reserveVoiceCredits, startVoiceReservation,
  type VoiceReservationInput } from "@/server/voice-credit-reservation.server";

async function attempt(mode: "manual" | "predictive" = "manual") {
  const f = await confirmed(), proof = await verified(f);
  const args: VoiceReservationInput = { workspaceId, userId: actor, accountSid, kind: "staffed", to: customer, from: callerId,
    campaignId: 123, operationKey: `audio-customer:${randomUUID()}`, audioSource: {
      connectionId: f.row.id, generation: f.row.generation, destination: phone, mode, proof,
    } };
  return { ...f, args };
}

async function funded(args: VoiceReservationInput) {
  const result = await reserveVoiceCredits(args);
  if (!result.ok) throw new Error(`Customer admission refused: ${result.reason}`);
  return result.reservation;
}

describe("customer funding through one confirmed phone", () => {
  useOwnedAudioFixture();

  test("saves separate audio provenance and one customer hold without another agent dial", async () => {
    const f = await attempt(), reservation = await funded(f.args);
    expect(reservation).toMatchObject({ audio_connection_id: f.row.id, audio_generation: 1, audio_destination: phone,
      audio_agent_sid: f.call.sid, audio_conference_callback: f.row.conference_callback, audio_mode: "manual",
      conference_id: f.room.friendlyName, conference_sid: f.room.sid, setup_to: null, setup_sid: null, setup_client_identity: null,
      credits: 4, provider_sid: null, state: "reserved" });
    const [totals] = await sql`select sum(credits)::int as held from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(totals.held).toBe(4); expect(await state()).toMatchObject({ credits: 100, reservations: 1, ledger: 0 });
    expect(web.create).not.toHaveBeenCalled();
  });

  test("concurrent retries reserve only one customer, and a different manual intent must wait", async () => {
    const f = await attempt();
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveVoiceCredits(f.args)));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok).every(result => result.reason === "dispatch_in_progress")).toBe(true);
    expect(await reserveVoiceCredits({ ...f.args, operationKey: `other:${randomUUID()}` })).toEqual({ ok: false, reason: "audio_source_unavailable" });
    expect(await state()).toMatchObject({ credits: 100, reservations: 1, ledger: 0 });
  });

  test("accepted intent replay precedes a canceled source and an expired physical observation", async () => {
    const f = await attempt(), reservation = await funded(f.args), customerSid = sid();
    const started = await startVoiceReservation(reservation, { voiceUrl: "https://audio-connection.example.test/customer", statusCallback: "https://audio-connection.example.test/status" }, f.args.audioSource?.proof);
    await recordVoiceReservationProvider(started, customerSid);
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    vi.spyOn(Date, "now").mockReturnValue((f.args.audioSource?.proof.observedAt ?? 0) + 6000);
    try {
      expect(await reserveVoiceCredits(f.args)).toMatchObject({ ok: false, reason: "already_dispatched", callSid: customerSid });
      expect(await replayVoiceOperation(f.args)).toMatchObject({ ok: false, reason: "already_dispatched", callSid: customerSid });
    } finally { vi.restoreAllMocks(); }
    const [call] = await sql`select parent_call_sid, direction, "to", "from" from public.call where sid = ${customerSid}`;
    expect(call).toMatchObject({ parent_call_sid: null, direction: "outbound-api", to: customer, from: callerId });
    expect(await state()).toMatchObject({ reservations: 1, ledger: 0 });
  });

  test.each(["connection", "generation", "destination", "mode", "room", "customer", "actor"])("accepted replay rejects changed %s", async change => {
    const f = await attempt(), reservation = await funded(f.args), customerSid = sid();
    await recordVoiceReservationProvider(await startVoiceReservation(reservation, {
      voiceUrl: "https://audio-connection.example.test/customer", statusCallback: "https://audio-connection.example.test/status",
    }, f.args.audioSource?.proof), customerSid);
    if (!f.args.audioSource) throw new Error("Audio source fixture required");
    const audio = { ...f.args.audioSource };
    const args = { ...f.args, audioSource: audio };
    if (change === "connection") audio.connectionId = randomUUID();
    if (change === "generation") audio.generation += 1;
    if (change === "destination") audio.destination = otherPhone;
    if (change === "mode") audio.mode = "predictive";
    if (change === "room") args.conferenceId = "other-room";
    if (change === "customer") args.to = otherPhone;
    if (change === "actor") args.userId = randomUUID();
    expect(await replayVoiceOperation(args)).toEqual({ ok: false, reason: "dispatch_in_progress" });
    expect(await state()).toMatchObject({ reservations: 1 });
  });

  test.each(["setupTo", "setupClientIdentity", "kind", "account", "room", "staleProof"])("refuses incompatible %s before outreach or funding", async change => {
    const f = await attempt(), before = await state();
    const args = { ...f.args, prepareOutreach: async () => { throw new Error("Unready audio reached outreach"); } };
    if (change === "setupTo") args.setupTo = phone;
    if (change === "setupClientIdentity") args.setupClientIdentity = actor;
    if (change === "kind") args.kind = "ivr";
    if (change === "account") args.accountSid = `AC${"4".repeat(32)}`;
    if (change === "room") args.conferenceId = "other-room";
    if (change === "staleProof" && args.audioSource) args.audioSource = { ...args.audioSource, proof: { ...args.audioSource.proof, observedAt: -1 } };
    expect(await reserveVoiceCredits(args)).toEqual({ ok: false, reason: "audio_source_unavailable" });
    expect(await state()).toEqual(before);
  });

  test("predictive fanout can fund several real customers on the same phone source", async () => {
    const f = await attempt("predictive");
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveVoiceCredits({ ...f.args, operationKey: randomUUID() })));
    expect(results.every(result => result.ok)).toBe(true);
    const [totals] = await sql`select count(distinct audio_agent_sid)::int as agents, sum(credits)::int as held,
      count(setup_sid)::int as setups from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid`;
    expect(totals).toMatchObject({ agents: 1, held: 20, setups: 0 });
    expect(await state()).toMatchObject({ credits: 100, reservations: 5, ledger: 0 });
    expect(await reserveVoiceCredits({ ...f.args, operationKey: randomUUID(), audioSource: f.args.audioSource && { ...f.args.audioSource, mode: "manual" } }))
      .toEqual({ ok: false, reason: "audio_source_unavailable" });
  });

  test("one settled customer frees its hold and the next customer keeps the same real phone", async () => {
    const f = await attempt(), reservation = await funded(f.args), customerSid = sid();
    await recordVoiceReservationProvider(await startVoiceReservation(reservation, {
      voiceUrl: "https://audio-connection.example.test/customer", statusCallback: "https://audio-connection.example.test/status",
    }, f.args.audioSource?.proof), customerSid);
    await sql`update public.call set status = 'completed', duration = '42' where sid = ${customerSid}`;
    const { findCallBySid } = await import("@/lib/telephony-db.server");
    const { billTerminalCallStatus } = await import("@/lib/twilio-call-status.server");
    const call = await findCallBySid(customerSid); if (!call) throw new Error("Owned funded customer required");
    await billTerminalCallStatus(call); await billTerminalCallStatus(call);
    const next = await funded({ ...f.args, operationKey: randomUUID(), audioSource: f.args.audioSource && { ...f.args.audioSource, proof: await verified(f) } });
    expect(next.id).not.toBe(reservation.id); expect(next.audio_agent_sid).toBe(f.call.sid); expect(next.setup_sid).toBeNull();
    const [entry] = await sql`select call_sid, amount from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(entry.call_sid).toBe(customerSid); expect(Number(entry.amount)).toBe(-4);
    expect(await state()).toMatchObject({ credits: 96, reservations: 2, ledger: 1 }); expect(web.create).not.toHaveBeenCalled();
  });

  test.each(["audio_generation", "audio_destination", "audio_agent_sid", "audio_conference_callback", "audio_mode"])("the database rejects partial source provenance without %s", async field => {
    const f = await attempt(), row = await funded(f.args);
    await expect(sql`update public.workspace_voice_reservation set ${sql(field)} = null where id = ${row.id}::uuid`)
      .rejects.toMatchObject({ constraint_name: "voice_customer_audio_source" });
  });

  test("a reserved hold cannot authorize customer send without a fresh source proof", async () => {
    const f = await attempt(), row = await funded(f.args);
    await expect(startVoiceReservation(row, { voiceUrl: "https://audio-connection.example.test/customer", statusCallback: "https://audio-connection.example.test/status" }))
      .rejects.toThrow("fresh confirmed phone audio");
    const [saved] = await sql`select state, send_started_at from public.workspace_voice_reservation where id = ${row.id}::uuid`;
    expect(saved).toMatchObject({ state: "reserved", send_started_at: null });
  });

  test("a canceled source between funding and send keeps the customer checkpoint unsent", async () => {
    const f = await attempt(), row = await funded(f.args);
    await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await expect(startVoiceReservation(row, { voiceUrl: "https://audio-connection.example.test/customer", statusCallback: "https://audio-connection.example.test/status" }, f.args.audioSource?.proof))
      .rejects.toThrow("changed before send");
    const [saved] = await sql`select state, send_started_at from public.workspace_voice_reservation where id = ${row.id}::uuid`;
    expect(saved).toMatchObject({ state: "reserved", send_started_at: null });
    expect(web.create).not.toHaveBeenCalled();
  });

  test("the database forbids assigning the persistent phone as a unique customer setup SID", async () => {
    const f = await attempt(), row = await funded(f.args);
    await expect(sql`update public.workspace_voice_reservation set setup_sid = ${f.call.sid} where id = ${row.id}::uuid`)
      .rejects.toMatchObject({ constraint_name: "voice_customer_audio_source" });
  });
});
