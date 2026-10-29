import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => { process.env.TZ = "UTC"; });
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(),
  emitPostgresChangeEvent: vi.fn(), emitTransactionHistoryInsertEvent: vi.fn(async () => undefined),
}));

const workspaceId = randomUUID(), foreignId = randomUUID(), actor = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
let sql: postgres.Sql;
let gate: typeof import("@/lib/outbound-credit-gate.server");
let balances: typeof import("@/lib/workspace-credits.server");
let voice: typeof import("@/server/voice-credit-reservation.server");
let settlement: typeof import("@/server/voice-credit-settlement.server");

describe("outbound availability excludes existing holds (#2879)", () => {
  beforeAll(async () => {
    const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Owned database URL required");
    sql = postgres(url, { max: 3, onnotice: () => {} });
    await sql`insert into public."user" (id, username) values (${actor}::uuid, ${`available-${actor}@example.test`})`;
    await sql`insert into public.workspace (id, name, credits) values
      (${workspaceId}::uuid, 'Owned availability fixture', 4), (${foreignId}::uuid, 'Foreign availability control', 100)`;
    gate = await import("@/lib/outbound-credit-gate.server");
    balances = await import("@/lib/workspace-credits.server");
    voice = await import("@/server/voice-credit-reservation.server");
    settlement = await import("@/server/voice-credit-settlement.server");
  });
  beforeEach(async () => {
    await sql`delete from public.job where workspace_id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    await sql`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.call where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_voice_reservation where workspace in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    await sql`delete from public.workspace_number_purchase where workspace in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    await sql`update public.workspace set credits = 4 where id = ${workspaceId}::uuid`;
  });
  afterAll(async () => {
    try {
      if (sql) {
        await sql`delete from public.job where workspace_id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
        await sql`delete from public."user" where id = ${actor}::uuid`;
      }
    } finally {
      await sql?.end();
      if (gate) { const { pool, directPool } = await import("@/server/db"); await Promise.all([pool.end(), directPool.end()]); }
    }
  });
  async function reserveVoice() {
    const result = await voice.reserveVoiceCredits({ workspaceId, kind: "staffed", accountSid,
      to: "+16135550591", from: "+16135550501", userId: actor });
    if (!result.ok) throw new Error("Affordable owned voice fixture required");
    return result.reservation;
  }
  async function numberHold(state: "reserved" | "creating" | "provisioned" | "completed" | "cancelled", ws = workspaceId) {
    await sql`insert into public.workspace_number_purchase
      (id, workspace, actor_user_id, phone_number, account_sid, credits, state, lease_token, lease_expires_at)
      values (${randomUUID()}::uuid, ${ws}::uuid, ${actor}, '+16135550502', ${accountSid}, 100,
        ${state}, ${randomUUID()}::uuid, now() + interval '5 minutes')`;
  }
  test("keeps the posted balance and no-hold admission unchanged", async () => {
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(4);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 4 });
  });
  test.each(["reserved", "creating", "active"] as const)("a %s voice hold cannot fund another outbound send", async (state) => {
    const hold = await reserveVoice();
    await sql`update public.workspace_voice_reservation set state = ${state} where id = ${hold.id}::uuid`;
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(4);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: false, reason: "insufficient_credits", balance: 0 });
  });
  test.each(["reserved", "creating", "provisioned"] as const)("a %s number hold cannot fund another outbound send", async (state) => {
    await sql`update public.workspace set credits = 100 where id = ${workspaceId}::uuid`;
    await numberHold(state);
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(100);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: false, reason: "insufficient_credits", balance: 0 });
  });
  test("a mixed voice and number hold leaves only the unused credits available", async () => {
    await sql`update public.workspace set credits = 107 where id = ${workspaceId}::uuid`;
    await reserveVoice(); await numberHold("provisioned");
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 3 });
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(107);
  });
  test.each(["released", "settled"] as const)("a %s voice hold does not consume availability", async (state) => {
    const hold = await reserveVoice();
    await sql`update public.workspace_voice_reservation set state = ${state} where id = ${hold.id}::uuid`;
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 4 });
  });
  test.each(["completed", "cancelled"] as const)("a %s number purchase does not consume availability", async (state) => {
    await numberHold(state);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 4 });
  });
  test("an expired uncertain send stays held until recovery proves its outcome", async () => {
    const hold = await reserveVoice();
    await sql`update public.workspace_voice_reservation set state = 'creating', send_started_at = now() - interval '1 hour',
      lease_expires_at = now() - interval '5 minutes' where id = ${hold.id}::uuid`;
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: false, reason: "insufficient_credits", balance: 0 });
  });
  test("another workspace's hold does not consume this balance", async () => {
    await numberHold("creating", foreignId);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 4 });
    expect(await gate.requireOutboundCredits(foreignId)).toEqual({ ok: false, reason: "insufficient_credits", balance: 0 });
  });
  test("releasing an unsent call restores availability without changing the posted balance", async () => {
    const hold = await reserveVoice();
    expect(await gate.requireOutboundCredits(workspaceId)).toMatchObject({ ok: false });
    await voice.releaseUnsentVoiceReservation(hold, "not_sent");
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 4 });
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(4);
  });
  test("one snapshot cannot combine a settled balance with its old hold", async () => {
    await sql`update public.workspace set credits = 12 where id = ${workspaceId}::uuid`;
    const hold = await reserveVoice(), callSid = `CA${randomUUID().replaceAll("-", "")}`;
    const started = await voice.startVoiceReservation(hold, { voiceUrl: "https://availability.example.test/voice",
      statusCallback: "https://availability.example.test/status" });
    await voice.recordVoiceReservationProvider(started, callSid);
    const reads = Array.from({ length: 40 }, () => gate.requireOutboundCredits(workspaceId));
    const completed = settlement.settleVoiceReservation({ workspaceId, callSid, status: "completed", duration: 42, note: "Owned availability proof" });
    const snapshots = await Promise.all(reads);
    expect(await completed).toMatchObject({ handled: true });
    expect(snapshots.every((r) => r.ok && r.balance === 8)).toBe(true);
    expect(await gate.requireOutboundCredits(workspaceId)).toEqual({ ok: true, balance: 8 });
    expect(await balances.getWorkspaceCreditsBalance(workspaceId)).toBe(8);
  });
  test("a missing workspace keeps the unknown-workspace result", async () => {
    expect(await gate.requireOutboundCredits(randomUUID())).toEqual({ ok: false, reason: "workspace_not_found" });
  });
});
