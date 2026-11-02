import { sql, state, useOwnedAudioFixture, workspaceId } from "../helpers/voice-audio-fixture";
import { phaseCall, phaseCapture, phaseManifest, phaseTerminal, phaseVisit } from "../helpers/voice-customer-phase-fixture";
import { describe, expect, test, vi } from "vitest";
import { createTenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";
import { call } from "@/db/schema";
import { publishVoiceRecordingTranscript } from "@/server/voice-recording-publication.server";

const transcript = { provider: "elevenlabs", full_text: "Owned completed provider result", metadata: { elevenlabsModel: "scribe_v2" } };

async function ready() {
  const f = await phaseCall(); await phaseCapture(f); await phaseTerminal(f);
  await phaseVisit(f, "participant-join"); await phaseVisit(f, "participant-leave");
  const manifest = await phaseManifest(f), source = await createTenantDb(workspaceId).call.findFirst({ where: eq(call.sid, f.customerSid) });
  expect(manifest.state).toBe("single-part"); if (!source) throw new Error("Owned source Call required");
  return { ...f, manifest, source };
}

describe("phase-qualified atomic transcript publication", () => {
  useOwnedAudioFixture();

  test.each([false, true])("a queued phase-qualified result retains one transcript and the billing flag policy (enabled %s)", async enabled => {
    const f = await ready();
    // Models provider work already completed for a job queued before the flag changed.
    await sql`update public.workspace set feature_flags = ${sql.json({ batchTranscription: enabled })} where id = ${workspaceId}::uuid`;
    const result = await publishVoiceRecordingTranscript({ workspaceId, source: f.source, manifest: f.manifest, transcript });
    expect(result).toMatchObject({ status: "completed", billed: enabled });
    expect(await publishVoiceRecordingTranscript({ workspaceId, source: f.source, manifest: f.manifest, transcript }))
      .toEqual({ status: "skipped", reason: "already_transcribed" });
    expect(await sql`select id from public.call_transcript where call_sid = ${f.customerSid}`).toHaveLength(1);
    expect(await state()).toMatchObject({ ledger: enabled ? 1 : 0 });
  });

  test("a queued conflicting receipt commits before publication can pass the same workspace fence", async () => {
    const f = await ready();
    await sql`update public.workspace set feature_flags = '{"batchTranscription":true}'::jsonb where id = ${workspaceId}::uuid`;
    let unlock = () => {}, locked = () => {};
    const release = new Promise<void>(resolve => { unlock = resolve; }), acquired = new Promise<void>(resolve => { locked = resolve; });
    let pid = 0;
    const barrier = sql.begin(async tx => {
      const [row] = await tx`select pg_backend_pid() as pid`; pid = row.pid;
      await tx`select id from public.workspace where id = ${workspaceId}::uuid for no key update`;
      locked(); await release;
    });
    let receipt: ReturnType<typeof phaseVisit> | undefined;
    let publication: ReturnType<typeof publishVoiceRecordingTranscript> | undefined;
    async function blocked(count: number) {
      await vi.waitFor(async () => {
        // Later row-lock waiters can queue behind the first waiter, not the barrier itself.
        const [row] = await sql`with recursive waiting(pid) as (
          select pid from pg_stat_activity where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
          union
          select a.pid from pg_stat_activity a join waiting w on w.pid = any(pg_blocking_pids(a.pid))
          where a.datname = current_database()
        ) select count(*)::int as blocked from waiting`;
        expect(row.blocked).toBeGreaterThanOrEqual(count);
      }, { timeout: 5000 });
    }
    try {
      await acquired;
      receipt = phaseVisit(f, "participant-leave", { SequenceNumber: "100" });
      await blocked(1);
      publication = publishVoiceRecordingTranscript({ workspaceId, source: f.source, manifest: f.manifest, transcript });
      await blocked(2);
      unlock(); await barrier;
      expect((await receipt).status).toBe(204);
      expect(await publication).toEqual({ status: "skipped", reason: "recording_parts_pending" });
      expect((await sql`select transcript_id from public.call where sid = ${f.customerSid}`)[0].transcript_id).toBeNull();
      expect(await state()).toMatchObject({ ledger: 0 });
    } finally {
      unlock(); await Promise.allSettled([barrier, receipt, publication]);
    }
  });
});
