import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignId = randomUUID();
const marker = `sim:sender-${workspaceId}`;
const profile = { environment: "local", workspaceName: `SIM sender ${workspaceId}`, workspaceMarker: marker, personaKey: "person-a" } as ResolvedSimProfile;
const phone = "+14165550123";
const sender = { phoneNumber: phone, sid: `PN${randomUUID().replaceAll("-", "")}`, accountSid: "AC_local_sender_fixture", friendlyName: "Fixture", capabilities: { sms: true, mms: false, voice: true, fax: false } };

suite("SIM sender database attachment (#2828)", () => {
  let client: postgres.Sql;
  let api: typeof import("../../app/server/sim-sender-attachment.server");
  let pools: Pick<typeof import("@/server/db"), "pool" | "directPool">;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("SIM sender tests require a database URL");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 1 });
    pools = await import("@/server/db");
    api = await import("../../app/server/sim-sender-attachment.server");
    await client`insert into public.workspace (id, name, sim_marker, twilio_data)
      values (${workspaceId}::uuid, ${profile.workspaceName}, ${marker}, ${client.json({ sid: sender.accountSid, authToken: "local-fixture-token" })}),
      (${foreignId}::uuid, 'Foreign sender fixture', null, '{}'::jsonb)`;
  });
  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (client) {
        await client`delete from public.workspace_number where workspace in ${client([workspaceId, foreignId])}`;
        await client`delete from public.workspace_audit_event where workspace_id = ${workspaceId}::uuid`;
        await client`delete from public.workspace where id in ${client([workspaceId, foreignId])}`;
      }
    } catch (error) { errors.push(error); }
    try { await client?.end(); } catch (error) { errors.push(error); }
    try { await pools?.pool.end(); } catch (error) { errors.push(error); }
    try { await pools?.directPool.end(); } catch (error) { errors.push(error); }
    finally { vi.unstubAllEnvs(); }
    if (errors.length) throw new AggregateError(errors, "SIM sender cleanup failed");
  });
  const attach = () => api.attachSimSenderInDatabase(profile, phone, "+14165550999", [sender]);

  test("concurrent attachments and JSONB reload reuse one active sender and one audit", async () => {
    const results = await Promise.all([attach(), attach()]);
    expect(results.map(result => result.status).sort()).toEqual(["attached", "reused"]);
    expect(await attach()).toMatchObject({ status: "reused", phoneLast4: "0123" });
    const rows = await client`select status, type from public.workspace_number where workspace = ${workspaceId}::uuid`;
    expect(rows).toEqual([{ status: "active", type: "sim_existing" }]);
    const [audit] = await client`select count(*)::int as count from public.workspace_audit_event where workspace_id = ${workspaceId}::uuid and action = 'sim.sender.attached'`;
    expect(audit.count).toBe(1);
    expect(await api.getSimSenderStatusInDatabase(profile)).toMatchObject({ status: "ready", phoneLast4: "0123" });
  });

  test("a released sender is not revived by attach or reported ready", async () => {
    await client`update public.workspace_number set status = 'released', released_at = now() where workspace = ${workspaceId}::uuid`;
    await expect(attach()).rejects.toThrow(/does not match/);
    expect(await api.getSimSenderStatusInDatabase(profile)).toMatchObject({ status: "blocked" });
    const [row] = await client`select status from public.workspace_number where workspace = ${workspaceId}::uuid`;
    expect(row.status).toBe("released");
  });

  test("a foreign phone collision is refused without modifying either row", async () => {
    const foreignPhone = "+14165550124";
    await client`insert into public.workspace_number (workspace, type, phone_number) values (${foreignId}::uuid, 'rented', ${foreignPhone})`;
    await expect(api.attachSimSenderInDatabase(profile, foreignPhone, "+14165550999", [{ ...sender, phoneNumber: foreignPhone, sid: "PN_foreign_collision" }])).rejects.toThrow(/other-workspace/);
    const [row] = await client`select workspace::text, type, status from public.workspace_number where phone_number = ${foreignPhone}`;
    expect(row).toEqual({ workspace: foreignId, type: "rented", status: "active" });
  });
});
