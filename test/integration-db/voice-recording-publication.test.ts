import { accountSid, actor, callerId, customer, funded, sql, useOwnedAudioFixture, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RpcExecutor } from "@/lib/db-rpc.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
import { enqueueFundedVoiceTerminalOutcome } from "@/server/voice-terminal-outcome.server";
import { callRecordingPartStoragePath } from "@/lib/call-recording-storage.server";
import { elevenlabsBatchTranscribeHandler } from "@/lib/worker/handlers/elevenlabs-batch-transcribe.server";
import { workspace_voice_reservation as reservations } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { prepareVoiceDialRecording } from "@/server/voice-recording-operation.server";
import { isObject } from "@/lib/type-safety-utils";
import { emitTransactionHistoryInsertEvent } from "@/lib/workspace-events.server";
import { recordVoiceCustomerCallTiming } from "@/server/voice-customer-media-boundary.server";

const io = vi.hoisted(() => ({ download: vi.fn(), fetch: vi.fn(), ledger: vi.fn<(tx: RpcExecutor) => Promise<void>>() }));
vi.mock("@/lib/object-storage.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/object-storage.server")>(), downloadObject: io.download,
}));
vi.mock("@/lib/transaction-history.server", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/transaction-history.server")>();
  return { ...actual, insertTransactionHistoryIdempotent: async (...args: Parameters<typeof actual.insertTransactionHistoryIdempotent>) => {
    await io.ledger(args[0]); return actual.insertTransactionHistoryIdempotent(...args);
  } };
});
const ledgerEvent = vi.mocked(emitTransactionHistoryInsertEvent);

const fault = `recording_publication_${randomUUID().replaceAll("-", "")}`;

async function asset(enabled = true, journal = true) {
  const f = await funded(), recordingSid = `RE${randomUUID().replaceAll("-", "")}`, operationId = randomUUID();
  const audioUrl = callRecordingPartStoragePath({ workspaceId, callSid: f.parent, accountSid, recordingSid });
  await enqueueFundedVoiceTerminalOutcome(workspaceId, f.child, { AccountSid: accountSid, CallSid: f.child,
    ParentCallSid: f.parent, To: customer, From: callerId, Direction: "outbound-dial", CallStatus: "completed",
    CallDuration: "30", CallbackSource: "call-progress-events", Timestamp: "Sun, 1 Nov 2026 14:00:30 +0000", SequenceNumber: "3" });
  if (journal) await sql`insert into public.workspace_voice_recording_operation
    (id, workspace, reservation_id, user_id, kind, intent_id, logical_call_sid, source_call_sid, source_to, source_from,
     source_direction, account_sid, callback_url, state, provider_sid, provider_status, send_started_at, terminal_at,
     recording_duration_seconds, audio_url, lease_token, lease_expires_at)
    values (${operationId}::uuid, ${workspaceId}::uuid, ${f.id}::uuid, ${actor}, 'dial', ${f.id}::uuid,
      ${f.parent}, ${f.parent}, '', ${`client:${actor}`}, 'inbound', ${accountSid},
      'https://audio-connection.example.test/api/voice-recording', 'accepted', ${recordingSid}, 'completed', now(), now(),
      30, ${audioUrl}, ${randomUUID()}::uuid, now())`;
  await sql`update public.call set audio_url = ${audioUrl}, recording_sid = ${recordingSid}, recording_duration = '30'
    where workspace = ${workspaceId}::uuid and sid = ${f.parent}`;
  await sql`update public.workspace set feature_flags = ${sql.json({ batchTranscription: enabled })} where id = ${workspaceId}::uuid`;
  return { ...f, audioUrl, recordingSid, operationId };
}

function job(callSid: string): ClaimedJobRow {
  return { id: 1, type: "elevenlabs_batch_transcribe", params: { callSid }, workspace_id: workspaceId,
    user_id: actor, attempt_count: 1, max_attempts: 3 };
}

async function snapshot(callSid: string) {
  const [call] = await sql`select transcript_id from public.call where workspace = ${workspaceId}::uuid and sid = ${callSid}`;
  const transcripts = await sql`select id, provider, language, full_text, word_count, duration_ms, metadata
    from public.call_transcript where call_sid = ${callSid}`;
  const [billing] = await sql`select credits, (select count(*)::int from public.transaction_history
    where workspace = ${workspaceId}::uuid) as ledger from public.workspace where id = ${workspaceId}::uuid`;
  return { pointer: call?.transcript_id, transcripts, ...billing };
}

async function clearPublicationFault() {
  await sql.unsafe(`drop trigger if exists ${fault} on public.call`);
  await sql.unsafe(`drop function if exists public.${fault}()`);
}

async function prepareInitial(f: Awaited<ReturnType<typeof asset>>) {
  const owner = await createTenantDb(workspaceId).workspace_voice_reservation.findFirst({ where: eq(reservations.id, f.id) });
  if (!owner) throw new Error("Owned publication reservation required");
  return prepareVoiceDialRecording(owner, { sid: f.parent, accountSid, to: "", from: `client:${actor}`,
    direction: "inbound", parentCallSid: null }, "https://audio-connection.example.test");
}

describe("atomic recording transcript publication", () => {
  useOwnedAudioFixture();
  beforeEach(() => {
    io.download.mockReset().mockResolvedValue(Buffer.from("owned recording bytes"));
    io.fetch.mockReset().mockImplementation(async (url: string) => {
      if (url !== "https://api.elevenlabs.io/v1/speech-to-text") throw new Error("Owned STT boundary required");
      return Response.json({ text: "hello customer", language_code: "en", words: [{ text: "hello" }, { text: "customer" }] });
    });
    ledgerEvent.mockReset().mockResolvedValue(undefined); io.ledger.mockReset();
    vi.stubGlobal("fetch", io.fetch); vi.stubEnv("ELEVENLABS_API_KEY", "owned-batch-proof");
  });
  afterEach(async () => {
    await clearPublicationFault();
    await sql`update public.call set transcript_id = null where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call_transcript where call_sid in (select sid from public.call where workspace = ${workspaceId}::uuid)`;
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  test.each([false, true])("retains one transcript and the existing billing policy (enabled=%s)", async enabled => {
    const f = await asset(enabled);
    const result = await elevenlabsBatchTranscribeHandler(job(f.parent));
    expect(result).toMatchObject({ status: "completed", transcriptId: expect.any(String) });
    const saved = await snapshot(f.parent);
    expect(saved).toMatchObject({ credits: enabled ? 99 : 100, ledger: enabled ? 1 : 0,
      transcripts: [{ provider: "elevenlabs_scribe_v2", language: "en", full_text: "hello customer", word_count: 2,
        duration_ms: "30000", metadata: { elevenlabsModel: "scribe_v2", wordCount: 2 } }] });
    expect(saved.pointer).toBe(saved.transcripts[0].id);
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toEqual({ status: "skipped", reason: "already_transcribed" });
    expect(await snapshot(f.parent)).toEqual(saved); expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  test("keeps an unjournaled legacy recording eligible", async () => {
    const f = await asset(false, false);
    await sql`delete from public.workspace_voice_reservation where workspace = ${workspaceId}::uuid and id = ${f.id}::uuid`;
    const legacyJob = job(f.parent); legacyJob.workspace_id = null;
    expect(await elevenlabsBatchTranscribeHandler(legacyJob)).toMatchObject({ status: "completed" });
    expect(await snapshot(f.parent)).toMatchObject({ credits: 100, ledger: 0, transcripts: [{ full_text: "hello customer" }] });
  });

  test.each(["call pointer", "ledger"])("rolls back every publication write after a failed %s write, then retries", async phase => {
    const f = await asset();
    if (phase === "call pointer") {
      await sql.unsafe(`create function public.${fault}() returns trigger language plpgsql as $$ begin
        if new.transcript_id is not null then raise exception 'Owned publication pointer fault'; end if; return new; end $$`);
      await sql.unsafe(`create trigger ${fault} before update on public.call for each row execute function public.${fault}()`);
    } else io.ledger.mockRejectedValueOnce(new Error("Owned publication ledger fault"));
    await expect(elevenlabsBatchTranscribeHandler(job(f.parent))).rejects.toThrow();
    expect(await snapshot(f.parent)).toEqual({ pointer: null, transcripts: [], credits: 100, ledger: 0 });
    expect(ledgerEvent).not.toHaveBeenCalled();
    await clearPublicationFault(); io.ledger.mockReset();
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toMatchObject({ status: "completed" });
    expect(await snapshot(f.parent)).toMatchObject({ credits: 99, ledger: 1, transcripts: [{ full_text: "hello customer" }] });
  });

  test.each([
    ["audio_url", "owned/replacement.mp3"], ["recording_sid", `RE${"e".repeat(32)}`],
    ["recording_duration", "31"], ["account_sid", `AC${"e".repeat(32)}`],
    ["parent_call_sid", "child"], ["direction", "outbound-api"], ["to", "+16135550998"], ["from", "+16135550999"],
  ])("withholds a result when the Call %s changes during STT", async (field, value) => {
    const f = await asset();
    io.fetch.mockImplementationOnce(async () => {
      await sql`update public.call set ${sql(field)} = ${field === "parent_call_sid" ? f.child : value}
        where workspace = ${workspaceId}::uuid and sid = ${f.parent}`;
      return Response.json({ text: "old media result" });
    });
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toEqual({ status: "skipped", reason: "recording_parts_pending" });
    expect(await snapshot(f.parent)).toEqual({ pointer: null, transcripts: [], credits: 100, ledger: 0 });
  });

  test("concurrent completed deliveries publish once without a unique-key failure", async () => {
    const f = await asset(); let entered = 0, resume = () => {};
    const ready = new Promise<void>(resolve => { resume = resolve; });
    io.fetch.mockImplementation(async () => { if (++entered === 2) resume(); await ready; return Response.json({ text: "same conversation" }); });
    const results = await Promise.allSettled([elevenlabsBatchTranscribeHandler(job(f.parent)), elevenlabsBatchTranscribeHandler(job(f.parent))]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const values = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    expect(values).toEqual(expect.arrayContaining([{ status: "skipped", reason: "already_transcribed" },
      { status: "completed", transcriptId: expect.any(String) }]));
    const saved = await snapshot(f.parent);
    expect(saved.transcripts).toHaveLength(1); expect(saved.pointer).toBe(saved.transcripts[0].id);
    expect(saved).toMatchObject({ credits: 99, ledger: 1 });
  });

  test("stronger matching customer timing does not discard the same complete media result", async () => {
    const f = await asset();
    io.fetch.mockImplementationOnce(async () => {
      const owner = await createTenantDb(workspaceId).workspace_voice_reservation.findFirst({ where: eq(reservations.id, f.id) });
      if (!owner) throw new Error("Original customer required");
      await recordVoiceCustomerCallTiming(owner, { sid: f.child, accountSid, to: customer, from: callerId,
        direction: "outbound-dial", parentCallSid: f.parent, status: "completed", duration: "30",
        startTime: new Date("2026-11-01T14:00:00Z"), endTime: new Date("2026-11-01T14:00:30Z") });
      return Response.json({ text: "same complete media" });
    });
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toMatchObject({ status: "completed" });
    expect(await snapshot(f.parent)).toMatchObject({ credits: 99, ledger: 1, transcripts: [{ full_text: "same complete media" }] });
  });

  test.each([false, true])("initial nonce preparation waits for final publication (journal=%s)", async journal => {
    const f = await asset(true, journal); let resume = () => {}, entered = false, publicationPid = 0;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    io.ledger.mockImplementation(async tx => {
      const [row] = await tx.execute(drizzleSql`select pg_backend_pid() as pid`);
      if (!isObject(row) || typeof row.pid !== "number") throw new Error("Owned publication backend required");
      publicationPid = row.pid; entered = true; await gate;
    });
    const publishing = Promise.allSettled([elevenlabsBatchTranscribeHandler(job(f.parent))]);
    let preparing = Promise.resolve<PromiseSettledResult<unknown>[]>([]);
    try {
      await vi.waitFor(() => expect(entered).toBe(true), { timeout: 2000, interval: 10 });
      preparing = Promise.allSettled([prepareInitial(f)]);
      await vi.waitFor(async () => {
        const blocked = await sql`select exists(select 1 from pg_locks l where l.pid = a.pid
          and l.relation = 'public.workspace_voice_reservation'::regclass and l.mode = 'RowShareLock') as reservation_lock
          from pg_stat_activity a where ${publicationPid} = any(pg_blocking_pids(a.pid))`;
        expect(blocked.some(row => row.reservation_lock === true)).toBe(true);
      }, { timeout: 2000, interval: 10 });
      expect(await snapshot(f.parent)).toEqual({ pointer: null, transcripts: [], credits: 100, ledger: 0 });
      expect(ledgerEvent).not.toHaveBeenCalled();
      resume();
      const outcomes = (await Promise.all([publishing, preparing])).flat();
      expect(outcomes.map(r => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(await snapshot(f.parent)).toMatchObject({ credits: 99, ledger: 1, transcripts: [{ full_text: "hello customer" }] });
    } finally { resume(); await Promise.all([publishing, preparing]); io.ledger.mockReset(); }
  });

  test("an initial nonce prepared before publication withholds the whole-call transcript", async () => {
    const f = await asset(true, false);
    expect(await prepareInitial(f)).toMatchObject({ state: "prepared" });
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toEqual({ status: "skipped", reason: "recording_parts_pending" });
    expect(await snapshot(f.parent)).toEqual({ pointer: null, transcripts: [], credits: 100, ledger: 0 });
    expect(io.download).not.toHaveBeenCalled(); expect(io.fetch).not.toHaveBeenCalled();
  });

  test.each([false, true])("ledger notification observes committed publication (emitter fails=%s)", async fails => {
    const f = await asset();
    const observed: Awaited<ReturnType<typeof snapshot>>[] = [];
    ledgerEvent.mockImplementation(async () => {
      const visible = await snapshot(f.parent);
      observed.push(visible);
      if (fails) throw new Error("Owned notification failure after commit");
    });
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toMatchObject({ status: "completed" });
    expect(await elevenlabsBatchTranscribeHandler(job(f.parent))).toEqual({ status: "skipped", reason: "already_transcribed" });
    expect(ledgerEvent).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject([{ credits: 99, ledger: 1, transcripts: [{ full_text: "hello customer" }] }]);
    expect(observed[0].pointer).toBe(observed[0].transcripts[0].id);
    expect(await snapshot(f.parent)).toMatchObject({ credits: 99, ledger: 1 });
  });

  test("does not adopt or overwrite an unlinked transcript with unknown source", async () => {
    const f = await asset();
    await sql`insert into public.call_transcript (call_sid, provider, full_text) values (${f.parent}, 'unknown-legacy', 'retained original')`;
    await expect(elevenlabsBatchTranscribeHandler(job(f.parent))).rejects.toThrow();
    expect(await snapshot(f.parent)).toMatchObject({ pointer: null, credits: 100, ledger: 0,
      transcripts: [{ provider: "unknown-legacy", full_text: "retained original" }] });
  });
});
