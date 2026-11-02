import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { foreignId, rooms, sql, state, useOwnedAudioFixture, web, workspaceId } from "../helpers/voice-audio-fixture";
import { phaseCall, phaseCapture, phaseManifest, phaseTerminal, phaseVisit, phaseVoice } from "../helpers/voice-customer-phase-fixture";
import { runVoiceRecordingCopy } from "@/lib/voice-recording-copy.server";
import { claimVoiceReservationRecovery } from "@/server/voice-credit-reservation.server";
import { reconcileVoiceReservation } from "@/lib/voice-credit-recovery.server";
import { settleVoiceReservation } from "@/server/voice-credit-settlement.server";
import { createTenantDb } from "@/server/tenant-db";

const fault = `phase_fault_${randomUUID().replaceAll("-", "")}`;
async function clearFault() {
  await sql.unsafe(`drop trigger if exists ${fault} on public.workspace_voice_customer_phase`);
  await sql.unsafe(`drop trigger if exists ${fault} on public.job`);
  await sql.unsafe(`drop function if exists public.${fault}()`);
}

describe("saved customer Conference phase", () => {
  useOwnedAudioFixture();
  afterEach(clearFault);

  test("the signed instruction saves its exact version, source and XML digest once", async () => {
    const f = await phaseCall(false), response = await phaseVoice(f), xml = await response.text();
    expect(xml).toContain("<Conference");
    const [phase] = await sql`select p.*, r.customer_phase_id from public.workspace_voice_customer_phase p
      join public.workspace_voice_reservation r on r.id = p.reservation_id where p.reservation_id = ${f.owner.id}::uuid`;
    expect(phase).toBeDefined();
    expect(phase).toMatchObject({ id: phase.customer_phase_id, capability: "phone-conference-v1", user_id: f.owner.user_id,
      account_sid: f.owner.account_sid, customer_call_sid: f.customerSid, logical_call_sid: f.customerSid,
      audio_connection_id: f.row.id, audio_generation: f.row.generation, conference_sid: f.row.conference_sid,
      conference_name: f.row.conference_id, callback_url: f.row.conference_callback, recording_operation_id: f.urls.customerRecording.id,
      instruction_digest: createHash("sha256").update(xml).digest("hex") });
    expect(xml).toContain(`participantLabel="customer:v1:${f.owner.id}:${phase.id}"`);
    expect((await (await phaseVoice(f)).text())).not.toContain("<Conference");
    expect(await sql`select id from public.workspace_voice_customer_phase where workspace = ${workspaceId}::uuid`).toHaveLength(1);
    expect(await state()).toMatchObject({ reservations: 1, ledger: 0 });
  });

  test("a phase insert failure rolls back the instruction grant, which can retry", async () => {
    const f = await phaseCall(false);
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin raise exception 'Owned phase insert fault'; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.workspace_voice_customer_phase for each row execute function public.${fault}()`);
    expect((await (await phaseVoice(f)).text())).not.toContain("<Conference");
    expect((await sql`select customer_phase_id, recipient_instruction_issued_at from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`)[0])
      .toEqual({ customer_phase_id: null, recipient_instruction_issued_at: null });
    await clearFault();
    expect((await (await phaseVoice(f)).text())).toContain("<Conference");
  });

  test("concurrent signed retries save one phase and emit one joining response", async () => {
    const f = await phaseCall(false), replies = await Promise.all(Array.from({ length: 8 }, () => phaseVoice(f)));
    expect((await Promise.all(replies.map(response => response.text()))).filter(xml => xml.includes("<Conference"))).toHaveLength(1);
    expect(await sql`select id from public.workspace_voice_customer_phase where workspace = ${workspaceId}::uuid`).toHaveLength(1);
  });

  test("customer termination during source verification prevents a later joining grant", async () => {
    const f = await phaseCall(false), participant = rooms.participant.getMockImplementation();
    if (!participant) throw new Error("Owned source participant required");
    rooms.participant.mockImplementationOnce(async (...args) => {
      await phaseTerminal(f);
      return participant(...args);
    });
    expect((await (await phaseVoice(f)).text())).not.toContain("<Conference");
    expect((await sql`select customer_phase_id, recipient_instruction_issued_at from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`)[0])
      .toEqual({ customer_phase_id: null, recipient_instruction_issued_at: null });
    expect(await sql`select id from public.workspace_voice_customer_phase where workspace = ${workspaceId}::uuid`).toHaveLength(0);
  });

  test("an old grant cannot clear its timestamp and acquire a new capability", async () => {
    const f = await phaseCall(false);
    await sql`update public.workspace_voice_reservation set recipient_instruction_issued_at = clock_timestamp() where id = ${f.owner.id}::uuid`;
    await expect(sql`update public.workspace_voice_reservation set recipient_instruction_issued_at = null where id = ${f.owner.id}::uuid`)
      .rejects.toThrow("instruction is immutable");
    await expect(sql`update public.workspace_voice_reservation set customer_phase_id = ${randomUUID()}::uuid,
      recipient_instruction_issued_at = clock_timestamp() where id = ${f.owner.id}::uuid`).rejects.toThrow("first instruction");
    expect((await (await phaseVoice(f)).text())).not.toContain("<Conference");
    await phaseCapture(f); await phaseTerminal(f);
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "customer_phase_unproven" });
  });

  test("reordered exact receipts close a phase without Conference sequence density or uniqueness", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    expect((await phaseVisit(f, "participant-leave", { SequenceNumber: "0" })).status).toBe(204);
    expect(await phaseManifest(f)).toMatchObject({ state: "pending", reason: "customer_phase_history_incomplete" });
    expect((await phaseVisit(f, "participant-join")).status).toBe(204);
    expect((await phaseVisit(f, "participant-join")).status).toBe(204);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(2);
    expect(await phaseManifest(f)).toMatchObject({ state: "single-part", phaseProof: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  test.each(["ParticipantLabel", "CallSid", "ConferenceSid", "FriendlyName"])("retains a signed %s identity conflict before rejecting it", async field => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    const value = field === "CallSid" ? `CA${"9".repeat(32)}` : field === "ConferenceSid" ? `CF${"9".repeat(32)}` : "different";
    expect((await phaseVisit(f, "participant-join", { [field]: value })).status).toBe(403);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(1);
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "customer_phase_history_conflict" });
  });

  test("distinct signed visits block media proof while valid live events remain acknowledged", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    expect((await phaseVisit(f, "participant-join")).status).toBe(204);
    expect((await phaseVisit(f, "participant-leave")).status).toBe(204);
    expect((await phaseVisit(f, "participant-leave", { SequenceNumber: "100" })).status).toBe(204);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(3);
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "customer_phase_history_conflict" });
  });

  test("an invalid signature cannot add evidence or poison a genuine later visit", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    expect((await phaseVisit(f, "participant-join", {}, false)).status).toBe(403);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(0);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
    expect(await phaseManifest(f)).toMatchObject({ state: "single-part" });
  });

  test.each(["Hold", "Muted"])("observed customer %s cannot prove continuous audible participation", async field => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    await phaseVisit(f, "participant-join", { [field]: "true" }); await phaseVisit(f, "participant-leave");
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "customer_phase_unsupported_state" });
  });

  test("phase identity and event storage stay in their original workspace", async () => {
    const f = await phaseCall(); await phaseVisit(f, "participant-join");
    const [phase] = await sql`select id from public.workspace_voice_customer_phase where reservation_id = ${f.owner.id}::uuid`;
    expect(await createTenantDb(foreignId).workspace_voice_customer_phase.findMany()).toEqual([]);
    expect(await createTenantDb(foreignId).workspace_voice_customer_phase_event.findMany()).toEqual([]);
    await expect(createTenantDb(foreignId).workspace_voice_customer_phase_event.insert({ id: randomUUID(), phase_id: phase.id,
      facts: {}, fingerprint: "0".repeat(64) })).rejects.toThrow();
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(1);
  });

  test.each(["", "Sun, 1 Nov 2026 14:00:01 +0000"])("unknown or equal visit time never proves zero media (%s)", async timestamp => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave", { Timestamp: timestamp });
    expect(await phaseManifest(f)).toMatchObject({ state: "pending", reason: "customer_phase_time_unproven" });
  });

  test("a signed terminal event cannot substitute for actual provider Call timing", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f, false);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "customer_phase_call_time_unproven" });
  });

  test("a late phase wake reaches one batch job from copied media", async () => {
    const f = await phaseCall(), part = await phaseCapture(f); await phaseTerminal(f);
    await sql`update public.workspace set feature_flags = '{"batchTranscription":true}'::jsonb where id = ${workspaceId}::uuid`;
    await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token);
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`).toHaveLength(0);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and idempotency_key like 'voice_customer_phase:%'`).toHaveLength(2);
    await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token); await runVoiceRecordingCopy(workspaceId, part.id, part.lease_token);
    expect(await sql`select params from public.job where workspace_id = ${workspaceId}::uuid and type = 'elevenlabs_batch_transcribe'`)
      .toEqual([{ params: { callSid: f.customerSid } }]);
    expect(await state()).toMatchObject({ ledger: 0 });
  });

  test("a phase wake write failure rolls back the receipt and retries both together", async () => {
    const f = await phaseCall(); await phaseCapture(f);
    await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
      if new.idempotency_key like 'voice_customer_phase:%' then raise exception 'Owned phase wake fault'; end if; return new; end $$`);
    await sql.unsafe(`create trigger ${fault} before insert on public.job for each row execute function public.${fault}()`);
    expect((await phaseVisit(f, "participant-join")).status).toBe(500);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(0);
    await clearFault();
    expect((await phaseVisit(f, "participant-join")).status).toBe(204);
    expect(await sql`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(1);
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and idempotency_key like 'voice_customer_phase:%'`).toHaveLength(1);
  });

  test("phase identity and signed facts remain immutable while their owner exists", async () => {
    const f = await phaseCall(); await phaseVisit(f, "participant-join");
    await expect(sql`update public.workspace_voice_customer_phase set instruction_digest = ${"0".repeat(64)} where reservation_id = ${f.owner.id}::uuid`)
      .rejects.toThrow("history is immutable");
    await expect(sql`update public.workspace_voice_customer_phase_event set facts = '{}'::jsonb where workspace = ${workspaceId}::uuid`)
      .rejects.toThrow("history is immutable");
    await expect(sql`delete from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`)
      .rejects.toThrow("belongs to its phase");
    await expect(sql`delete from public.workspace_voice_customer_phase where reservation_id = ${f.owner.id}::uuid`)
      .rejects.toThrow("belongs to its reservation");
  });

  test("settled phase timing recovery reads the original Call without another debit", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f, false);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
    await settleVoiceReservation({ workspaceId, callSid: f.customerSid, status: "completed", duration: 42, note: "Owned phase settlement" });
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and idempotency_key like 'voice_recording_phase_boundary:%'`).toHaveLength(1);
    const [settled] = await sql`select lease_expires_at from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`;
    expect(settled.lease_expires_at.getTime()).toBeLessThanOrEqual(Date.now());
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 second' where id = ${f.owner.id}::uuid`;
    const before = await state(); web.fetch.mockClear();
    const claimed = (await claimVoiceReservationRecovery()).find(row => row.id === f.owner.id);
    expect(claimed?.state).toBe("settled"); if (!claimed) throw new Error("Owned phase timing recovery required");
    expect(await reconcileVoiceReservation(claimed)).toBe("settled");
    expect(web.fetch).toHaveBeenCalledWith(f.customerSid);
    expect(await state()).toMatchObject({ credits: before.credits, ledger: before.ledger });
    expect(await phaseManifest(f)).toMatchObject({ state: "single-part" });
    expect(await sql`select id from public.job where workspace_id = ${workspaceId}::uuid and idempotency_key like 'voice_recording_phase_boundary:%'`).toHaveLength(2);
  });

  test.each(["sid", "accountSid", "direction", "parentCallSid"])("phase timing recovery refuses a changed original Call %s", async field => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f, false);
    await settleVoiceReservation({ workspaceId, callSid: f.customerSid, status: "completed", duration: 42, note: "Owned phase settlement" });
    const before = await state();
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 second' where id = ${f.owner.id}::uuid`;
    const claimed = (await claimVoiceReservationRecovery()).find(row => row.id === f.owner.id);
    if (!claimed) throw new Error("Owned phase recovery required");
    Object.assign(f.remote, { [field]: field === "parentCallSid" || field === "sid" ? `CA${"9".repeat(32)}` : "different" });
    await expect(reconcileVoiceReservation(claimed)).rejects.toThrow("different original Call");
    expect((await sql`select media_call_started_at from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`)[0].media_call_started_at).toBeNull();
    expect(await state()).toMatchObject({ credits: before.credits, ledger: before.ledger });
  });

  test("ordinary settled calls are not pulled into phase timing recovery", async () => {
    const f = await phaseCall(false); await phaseTerminal(f, false);
    await settleVoiceReservation({ workspaceId, callSid: f.customerSid, status: "completed", duration: 42, note: "Owned legacy settlement" });
    await sql`update public.workspace_voice_reservation set lease_expires_at = now() - interval '1 second' where id = ${f.owner.id}::uuid`;
    expect((await claimVoiceReservationRecovery()).some(row => row.id === f.owner.id)).toBe(false);
  });

  test("a lost required capture cannot fall back to legacy media", async () => {
    const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
    await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
    expect(await phaseManifest(f)).toMatchObject({ state: "single-part" });
    await sql`delete from public.workspace_voice_recording_operation where id = ${f.urls.customerRecording.id}::uuid`;
    expect(await phaseManifest(f)).toEqual({ state: "pending", reason: "recording_incomplete" });
  });

  test.each(["reservation", "workspace"])("%s deletion cleans phase history without relying on cascade order", async parent => {
    const f = await phaseCall(); await phaseVisit(f, "participant-join"); const rollback = new Error("Owned cascade proof rollback");
    await expect(sql.begin(async tx => {
      if (parent === "reservation") await tx`delete from public.workspace_voice_reservation where id = ${f.owner.id}::uuid`;
      else await tx`delete from public.workspace where id = ${workspaceId}::uuid`;
      expect(await tx`select id from public.workspace_voice_customer_phase where workspace = ${workspaceId}::uuid`).toHaveLength(0);
      expect(await tx`select id from public.workspace_voice_customer_phase_event where workspace = ${workspaceId}::uuid`).toHaveLength(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
