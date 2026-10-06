import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect } from "vitest";

/** Pause final bookkeeping after the number read, then race a real row update. */
export async function checkNumberReleaseFinalWrite({
  sql,
  workspaceId,
  numberId,
  armBarrier,
  release,
}: {
  sql: postgres.Sql;
  workspaceId: string;
  numberId: bigint;
  armBarrier: (install: () => Promise<void>) => void;
  release: () => Promise<{ error: unknown }>;
}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Owned database URL required");
  const tag = randomUUID().replaceAll("-", "");
  const name = `release_barrier_${tag}`;
  const key = Number.parseInt(tag.slice(0, 7), 16);
  const blocker = postgres(url, { max: 1 });
  const writer = postgres(url, { max: 1 });
  let releaseWork: ReturnType<typeof release> | undefined;
  let writeWork: Promise<postgres.RowList<postgres.Row[]>> | undefined;
  let writeFinished = false;
  let installed = false;
  async function waitUntil(check: () => Promise<boolean>) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }
  try {
    await blocker`select pg_advisory_lock(2085, ${key})`;
    await writer`select set_config('application_name', ${name}, false)`;
    armBarrier(async () => {
      await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$
        begin perform pg_advisory_xact_lock(2085, ${key}); return NEW; end $$`);
      await sql.unsafe(`create trigger ${name} before update of twilio_data on public.workspace
        for each row when (OLD.id = '${workspaceId}'::uuid) execute function public.${name}()`);
      installed = true;
    });
    releaseWork = release();
    expect(
      await waitUntil(async () => {
        const rows =
          await sql`select 1 from pg_locks where locktype = 'advisory'
          and classid = 2085 and objid = ${key} and objsubid = 2 and not granted`;
        return rows.length === 1;
      }),
      "Final bookkeeping must reach the barrier after the number read",
    ).toBe(true);
    writeWork =
      writer`update public.workspace_number set created_at = '2050-01-01T00:00:00Z'
      where workspace = ${workspaceId}::uuid and id = ${numberId.toString()}::bigint returning id`.then(
        (rows) => {
          writeFinished = true;
          return rows;
        },
      );
    expect(
      await waitUntil(async () => {
        if (writeFinished) return true;
        const rows = await sql`select 1 from pg_stat_activity
          where application_name = ${name} and wait_event_type = 'Lock'`;
        return rows.length === 1;
      }),
      "The concurrent writer must start",
    ).toBe(true);
    expect(
      writeFinished,
      "The checked number identity must remain locked",
    ).toBe(false);
    await blocker`select pg_advisory_unlock(2085, ${key})`;
    expect((await releaseWork).error).toBeNull();
    expect(
      await writeWork,
      "A late writer must not replace the released row",
    ).toHaveLength(0);
  } finally {
    await blocker`select pg_advisory_unlock(2085, ${key})`;
    await Promise.allSettled([releaseWork, writeWork]);
    if (installed) await sql.unsafe(`drop trigger ${name} on public.workspace`);
    await sql.unsafe(`drop function if exists public.${name}()`);
    await Promise.all([blocker.end(), writer.end()]);
  }
}
