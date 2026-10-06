import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { asRouteResponse } from "../helpers/route-result";
import { checkNumberReleaseFinalWrite } from "../helpers/number-release-final-write";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.BASE_URL = "http://localhost:3038";
});
const provider = vi.hoisted(() => ({
  accountSid: "AC00000000000000000000000000002085",
  clientAccountSid: null as string | null,
  records: new Map<
    string,
    { sid: string; accountSid: string; phoneNumber: string }
  >(),
  outgoing: new Map<
    string,
    { sid: string; accountSid: string; phoneNumber: string }
  >(),
  active: new Set<string>(),
  pools: new Map<string, Set<string>>(),
  fetch: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  detach: vi.fn(),
  outgoingRemove: vi.fn(),
}));
vi.mock("twilio", async (importOriginal) => {
  const original = await importOriginal<typeof import("twilio")>();
  class FixtureClient {
    accountSid = provider.clientAccountSid ?? provider.accountSid;
    incomingPhoneNumbers = Object.assign(
      (sid: string) => ({
        fetch: () => provider.fetch(sid),
        remove: () => provider.remove(sid),
      }),
      { list: provider.list },
    );
    outgoingCallerIds = Object.assign(
      (sid: string) => ({ remove: () => provider.outgoingRemove(sid) }),
      {
        list: async ({ phoneNumber }: { phoneNumber: string }) =>
          [...provider.outgoing.values()].filter(
            (row) => row.phoneNumber === phoneNumber,
          ),
      },
    );
    messaging = {
      v1: {
        services: (serviceSid: string) => ({
          phoneNumbers: Object.assign(
            (sid: string) => ({
              remove: () => provider.detach(serviceSid, sid),
            }),
            {
              list: async () =>
                [...(provider.pools.get(serviceSid) ?? [])].map((sid) =>
                  provider.records.get(sid),
                ),
            },
          ),
        }),
      },
    };
  }
  return {
    ...original,
    default: { ...original.default, Twilio: FixtureClient },
  };
});

const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID(),
  foreignWorkspace = randomUUID(),
  actor = randomUUID(),
  caller = randomUUID();
const tag = randomUUID().replaceAll("-", "");
const schemaName = `release_${tag}`,
  faultName = `release_fault_${tag}`;
const publicControlId = randomUUID(),
  publicControlLease = randomUUID();
const phone = "+14165550285",
  otherPhone = "+14165550286";
const sid = "PN00000000000000000000000000002085",
  otherSid = "PN00000000000000000000000000002086";
const serviceSid = "MG00000000000000000000000000002085";
let fixture: postgres.Sql, sql: postgres.Sql;
let numberId: bigint;
let service: typeof import("@/lib/database/workspace.server");
let faultTable: string | undefined;
const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
};
function absent() {
  return Object.assign(new Error("Synthetic absent resource"), {
    status: 404,
    code: 20404,
  });
}

describe.skipIf(!url)("number release recovers partial work (#2085)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("Database URL required");
    fixture = postgres(url, { max: 1 });
    await fixture.unsafe(`create schema "${schemaName}"`);
    const migration = await readFile(
      new URL(
        "../../client/migrations/20261006000001_number_release_recovery.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await fixture.unsafe(
      migration.replaceAll(
        "public.workspace_number_release",
        `"${schemaName}".workspace_number_release`,
      ),
    );
    const scopedUrl = new URL(url);
    scopedUrl.searchParams.set("search_path", `${schemaName},public`);
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.DATABASE_DIRECT_URL = scopedUrl.toString();
    sql = postgres(scopedUrl.toString(), { max: 3 });
    for (const id of [actor, caller])
      await sql`insert into public."user" (id, username, created_at) values (${id}::uuid, ${`release-${id}@example.test`}, now())`;
    for (const id of [workspaceId, foreignWorkspace])
      await sql`insert into public.workspace
      (id, name, credits, twilio_data, disabled, feature_flags) values (${id}::uuid, 'Owned release fixture', 100, '{}'::jsonb, false, '{}'::jsonb)`;
    for (const [id, role] of [
      [actor, "owner"],
      [caller, "caller"],
    ])
      await sql`insert into public.workspace_member
      (id, workspace_id, user_id, role_id) values (${`release:${workspaceId}:${id}`}, ${workspaceId}, ${id}, ${role})`;
    await fixture`insert into public.workspace_number_release
      (id, workspace, number_id, number_created_at, number_type, phone_number, account_sid, lease_token, lease_expires_at)
      values (${publicControlId}::uuid, ${workspaceId}::uuid, 9007199254740900, 'control', 'local', '+14165550999',
        'AC00000000000000000000000000009999', ${publicControlLease}::uuid, now() - interval '1 day')`;
    service = await import("@/lib/database/workspace.server");
  });
  async function clearFault() {
    if (faultTable) {
      await sql.unsafe(
        `drop trigger if exists ${faultName} on ${faultTable === "workspace_number_release" ? `"${schemaName}".workspace_number_release` : `public.${faultTable}`}`,
      );
      faultTable = undefined;
    }
    await sql.unsafe(`drop function if exists public.${faultName}()`);
  }
  async function installFault(table: string, event: string, when: string) {
    await sql.unsafe(
      `create function public.${faultName}() returns trigger language plpgsql as $$ begin raise exception 'Owned release persistence fault'; end $$`,
    );
    const relation =
      table === "workspace_number_release"
        ? `"${schemaName}".workspace_number_release`
        : `public.${table}`;
    await sql.unsafe(
      `create trigger ${faultName} before ${event} on ${relation} for each row when (${when}) execute function public.${faultName}()`,
    );
    faultTable = table;
  }
  beforeEach(async () => {
    await clearFault();
    await sql`delete from workspace_number_release where workspace in (${workspaceId}::uuid, ${foreignWorkspace}::uuid)`;
    await sql`delete from public.workspace_number_purchase where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.workspace_number where workspace in (${workspaceId}::uuid, ${foreignWorkspace}::uuid)`;
    provider.clientAccountSid = null;
    provider.active.clear();
    provider.records.clear();
    provider.outgoing.clear();
    provider.pools.clear();
    for (const [id, phoneNumber] of [
      [sid, phone],
      [otherSid, otherPhone],
    ]) {
      provider.records.set(id, {
        sid: id,
        accountSid: provider.accountSid,
        phoneNumber,
      });
      provider.active.add(id);
    }
    provider.pools.set(serviceSid, new Set([sid, otherSid]));
    provider.fetch.mockImplementation(async (id: string) => {
      if (!provider.active.has(id)) throw absent();
      return provider.records.get(id);
    });
    provider.list.mockImplementation(
      async ({ phoneNumber }: { phoneNumber: string }) =>
        [...provider.records.values()].filter(
          (row) =>
            row.phoneNumber === phoneNumber && provider.active.has(row.sid),
        ),
    );
    provider.remove.mockImplementation(async (id: string) => {
      if (!provider.active.delete(id)) throw absent();
      return true;
    });
    provider.outgoingRemove.mockImplementation(async (id: string) => {
      if (!provider.outgoing.delete(id)) throw absent();
      return true;
    });
    provider.detach.mockImplementation(async (ms: string, id: string) => {
      if (!provider.pools.get(ms)?.delete(id)) throw absent();
      return true;
    });
    const data = {
      sid: provider.accountSid,
      authToken: "synthetic-release-token",
      fixtureSetting: "preserve",
      onboarding: {
        messagingService: {
          serviceSid,
          desiredSendMode: "messaging_service",
          attachedSenderPhoneNumbers: [phone, otherPhone],
        },
      },
    };
    await sql`update public.workspace set twilio_data = ${sql.json(data)} where id = ${workspaceId}::uuid`;
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: provider.accountSid, authToken: "synthetic-release-token" })}
      where id = ${foreignWorkspace}::uuid`;
    const [number] =
      await sql`insert into public.workspace_number (workspace, type, phone_number, friendly_name, twilio_phone_number_sid)
      values (${workspaceId}::uuid, 'local', ${phone}, 'Owned release number', ${sid}) returning id`;
    numberId = BigInt(number.id);
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  });
  afterEach(async () => {
    if (sql) await clearFault();
    if (fixture) {
      const [control] =
        await fixture`select state, lease_token from public.workspace_number_release where id = ${publicControlId}::uuid`;
      expect(control).toEqual({
        state: "prepared",
        lease_token: publicControlLease,
      });
    }
  });
  afterAll(async () => {
    try {
      if (sql) {
        await clearFault();
        await sql`delete from public.workspace_number where workspace in (${workspaceId}::uuid, ${foreignWorkspace}::uuid)`;
        await sql`delete from public.workspace_member where workspace_id = ${workspaceId}`;
        await sql`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignWorkspace}::uuid)`;
        await sql`delete from public."user" where id in (${actor}::uuid, ${caller}::uuid)`;
      }
    } finally {
      await sql?.end();
      if (service) {
        const { pool, directPool } = await import("@/server/db");
        await Promise.all([pool.end(), directPool.end()]);
      }
      if (fixture) {
        await fixture.unsafe(`drop schema if exists "${schemaName}" cascade`);
        await fixture.end();
      }
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  async function receipt() {
    const [row] =
      await sql`select * from workspace_number_release where workspace = ${workspaceId}::uuid and number_id = ${numberId.toString()}::bigint`;
    return row;
  }
  async function state() {
    const [row] =
      await sql`select twilio_data, (select count(*)::int from public.workspace_number where workspace = ${workspaceId}::uuid) as numbers
      from public.workspace where id = ${workspaceId}::uuid`;
    return {
      active: provider.active.has(sid),
      numbers: row.numbers,
      attached:
        row.twilio_data.onboarding.messagingService.attachedSenderPhoneNumbers,
      live: [...(provider.pools.get(serviceSid) ?? [])].map(
        (id) => provider.records.get(id)?.phoneNumber,
      ),
      fixtureSetting: row.twilio_data.fixtureSetting,
    };
  }
  const release = () =>
    service.removeWorkspacePhoneNumber({ workspaceId, numberId });
  async function expireRelease() {
    await sql`update workspace_number_release set lease_expires_at = now() - interval '1 minute'
      where workspace = ${workspaceId}::uuid and state <> 'completed'`;
  }
  async function expectClean() {
    expect(await state()).toEqual({
      active: false,
      numbers: 0,
      attached: [otherPhone],
      live: [otherPhone],
      fixtureSetting: "preserve",
    });
    expect(await receipt()).toMatchObject({
      state: "completed",
      last_error: null,
    });
  }
  async function api(
    userId = actor,
    id = numberId.toString(),
    ws = workspaceId,
  ) {
    const { action } =
      await import("@/routes/api+/workspaces+/$workspaceId/numbers/$numberId.action.server");
    const { withDataPlaneRouteArgs } =
      await import("../helpers/route-context-mock");
    const request = new Request(
      `http://localhost/api/workspaces/${ws}/numbers/${id}`,
      { method: "DELETE" },
    );
    const args = await withDataPlaneRouteArgs(
      { request, params: { workspaceId: ws, numberId: id } },
      { workspaceId: ws, userId },
    );
    return asRouteResponse(action(args));
  }
  async function form(userId = actor, userRole = "owner") {
    const { action } =
      await import("@/routes/workspaces+/$id/phone-numbers.action.server");
    const { withWorkspaceRouteArgs } =
      await import("../helpers/route-context-mock");
    const request = new Request(
      `http://localhost/workspaces/${workspaceId}/phone-numbers`,
      {
        method: "POST",
        body: new URLSearchParams({
          formName: "remove-number",
          numberId: numberId.toString(),
        }),
      },
    );
    const args = await withWorkspaceRouteArgs(
      { request, params: { id: workspaceId } },
      { workspaceId, userId, userRole },
    );
    return asRouteResponse(action(args));
  }
  test("normal release commits bookkeeping before provider deletion and preserves other senders", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      expect(await receipt()).toMatchObject({
        state: "releasing",
        incoming_sids: [sid],
        account_sid: provider.accountSid,
      });
      expect(await state()).toMatchObject({
        numbers: 1,
        attached: [otherPhone],
        live: [otherPhone],
      });
      provider.active.delete(id);
      return true;
    });
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test("retry of a completed release returns success without provider work", async () => {
    expect((await release()).error).toBeNull();
    const calls = provider.remove.mock.calls.length;
    expect((await release()).error).toBeNull();
    expect(provider.remove).toHaveBeenCalledTimes(calls);
    await expectClean();
  });
  test("a completed release in another workspace is not a successful retry", async () => {
    expect((await release()).error).toBeNull();
    const result = await service.removeWorkspacePhoneNumber({
      workspaceId: foreignWorkspace,
      numberId,
    });
    expect(result.error).toBeTruthy();
    expect(provider.remove).toHaveBeenCalledOnce();
    await expectClean();
  });
  test("an invalid stored provider SID cannot count as a known absent number", async () => {
    await sql`update public.workspace_number set twilio_phone_number_sid = 'invalid-resource' where id = ${numberId.toString()}::bigint`;
    expect(String((await release()).error)).toContain("Release incomplete");
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({
      active: true,
      numbers: 1,
      attached: [phone, otherPhone],
      live: [phone, otherPhone],
    });
  });
  test("onboarding persistence failure prevents irreversible release and remains retryable", async () => {
    await installFault(
      "workspace",
      "update of twilio_data",
      `OLD.id = '${workspaceId}'::uuid`,
    );
    expect(String((await release()).error)).toContain(
      `Release incomplete for ${phone}`,
    );
    expect(provider.remove).not.toHaveBeenCalled();
    expect(provider.detach).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({
      active: true,
      numbers: 1,
      attached: [phone, otherPhone],
      live: [phone, otherPhone],
    });
    await clearFault();
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test.each([
    {
      table: "workspace_number",
      event: "delete",
      when: () => `OLD.workspace = '${workspaceId}'::uuid`,
      state: "released",
    },
    {
      table: "workspace_number_release",
      event: "update of state",
      when: () =>
        `NEW.workspace = '${workspaceId}'::uuid and NEW.state = 'completed'`,
      state: "released",
    },
    {
      table: "workspace_number_release",
      event: "update of state",
      when: () =>
        `NEW.workspace = '${workspaceId}'::uuid and NEW.state = 'released'`,
      state: "releasing",
    },
  ])(
    "$table / $state write failure after provider release recovers",
    async ({ table, event, when, state: releaseState }) => {
      await installFault(table, event, when());
      expect(String((await release()).error)).toContain(
        `Release incomplete for ${phone}`,
      );
      expect(await state()).toMatchObject({
        active: false,
        numbers: 1,
        attached: [otherPhone],
        live: [otherPhone],
      });
      expect(await receipt()).toMatchObject({ state: releaseState });
      await clearFault();
      expect((await release()).error).toBeNull();
      await expectClean();
    },
  );
  test.each([
    {
      event: "insert",
      when: () => `NEW.workspace = '${workspaceId}'::uuid`,
      incomplete: false,
    },
    {
      event: "update of incoming_sids",
      when: () => `NEW.workspace = '${workspaceId}'::uuid`,
      incomplete: true,
    },
  ])(
    "intent $event persistence failure does no provider deletion",
    async ({ event, when, incomplete }) => {
      await installFault("workspace_number_release", event, when());
      const result = await release();
      expect(String(result.error)).toContain(
        incomplete ? "Release incomplete" : "could not start",
      );
      expect(provider.remove).not.toHaveBeenCalled();
      expect(provider.detach).not.toHaveBeenCalled();
      expect(await state()).toMatchObject({
        active: true,
        numbers: 1,
        attached: [phone, otherPhone],
      });
      await clearFault();
      expect((await release()).error).toBeNull();
      await expectClean();
    },
  );
  test("a known absent provider number still completes local and sender cleanup", async () => {
    provider.active.delete(sid);
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test("a lost provider acknowledgement retries the same original resource", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      provider.active.delete(id);
      throw new Error("Synthetic lost acknowledgement");
    });
    expect(String((await release()).error)).toContain("Release incomplete");
    expect(await receipt()).toMatchObject({
      state: "releasing",
      incoming_sids: [sid],
    });
    expect((await release()).error).toBeNull();
    await expectClean();
    expect(provider.remove.mock.calls.every(([id]) => id === sid)).toBe(true);
  });
  test("unconfirmed provider removal keeps local inventory and allows retry", async () => {
    provider.remove.mockResolvedValueOnce(false);
    expect(String((await release()).error)).toContain("Release incomplete");
    expect(await state()).toMatchObject({ active: true, numbers: 1 });
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test.each([
    { error: new Error("Synthetic sender unavailable") },
    {
      error: Object.assign(new Error("Synthetic wrong 404"), {
        status: 404,
        code: 99999,
      }),
    },
    {
      error: Object.assign(new Error("Synthetic unauthorized"), {
        status: 401,
        code: 20003,
      }),
    },
  ])(
    "unexpected sender detach error retains the number and names the stale sender",
    async ({ error }) => {
      provider.detach.mockRejectedValueOnce(error);
      expect(String((await release()).error)).toContain(
        `Release incomplete for ${phone}`,
      );
      expect(provider.remove).not.toHaveBeenCalled();
      const { verifyWorkspaceMessagingSenderPool } =
        await import("@/lib/twilio-sender-pool.server");
      const pool = await verifyWorkspaceMessagingSenderPool({ workspaceId });
      expect(pool).toMatchObject({
        inSync: false,
        missingFromPool: [],
        extraInPool: [phone],
      });
      const { evaluateWorkspaceReadinessByIds } =
        await import("@/lib/messaging-onboarding/predicates");
      const { getWorkspaceMessagingOnboardingState } =
        await import("@/lib/messaging-onboarding/persistence.server");
      const results = evaluateWorkspaceReadinessByIds(
        {
          onboarding: await getWorkspaceMessagingOnboardingState({
            workspaceId,
          }),
          workspaceNumbers: [],
          senderPool: pool,
        },
        ["sender_pool_in_sync"],
      );
      expect(results).toMatchObject([
        {
          severity: "error",
          message: `Sender pool has unexpected numbers: ${phone}.`,
        },
      ]);
      expect((await release()).error).toBeNull();
      await expectClean();
    },
  );
  test("an already detached sender is idempotent", async () => {
    provider.pools.get(serviceSid)?.delete(sid);
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test.each([
    { field: "accountSid", value: "AC00000000000000000000000000009999" },
    { field: "phoneNumber", value: "+14165550999" },
    { field: "sid", value: otherSid },
  ])(
    "a fetched resource with changed $field is never released",
    async ({ field, value }) => {
      provider.fetch.mockResolvedValueOnce({
        ...provider.records.get(sid),
        [field]: value,
      });
      expect(String((await release()).error)).toContain("Release incomplete");
      expect(provider.detach).not.toHaveBeenCalled();
      expect(provider.remove).not.toHaveBeenCalled();
      expect(await state()).toMatchObject({
        active: true,
        numbers: 1,
        attached: [phone, otherPhone],
      });
      expect((await release()).error).toBeNull();
      await expectClean();
    },
  );
  test("legacy number lookup uses its exact phone and rejects ambiguous matches", async () => {
    await sql`update public.workspace_number set twilio_phone_number_sid = null where id = ${numberId.toString()}::bigint`;
    provider.list.mockResolvedValueOnce([
      provider.records.get(sid),
      { ...provider.records.get(sid), sid: otherSid },
    ]);
    expect(String((await release()).error)).toContain("Release incomplete");
    expect(provider.list).toHaveBeenCalledWith({
      phoneNumber: phone,
      limit: 100,
    });
    expect(provider.remove).not.toHaveBeenCalled();
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test("caller ID release removes only verified caller IDs and preserves rented inventory", async () => {
    await sql`update public.workspace_number set type = 'caller_id', twilio_phone_number_sid = null where id = ${numberId.toString()}::bigint`;
    const record = provider.records.get(sid);
    if (!record) throw new Error("Fixture caller ID missing");
    provider.outgoing.set(sid, record);
    provider.pools.get(serviceSid)?.delete(sid);
    expect((await release()).error).toBeNull();
    expect(provider.outgoingRemove).toHaveBeenCalledWith(sid);
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect(provider.active.has(sid)).toBe(true);
    expect(await state()).toMatchObject({
      numbers: 0,
      attached: [otherPhone],
      live: [otherPhone],
    });
    expect(await receipt()).toMatchObject({ state: "completed" });
  });
  test("a changed provider client cannot release an intent on another account", async () => {
    provider.detach.mockRejectedValueOnce(
      new Error("Synthetic first attempt failure"),
    );
    expect((await release()).error).toBeTruthy();
    provider.clientAccountSid = "AC00000000000000000000000000009999";
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    expect(String((await release()).error)).toContain("Release incomplete");
    expect(provider.remove).not.toHaveBeenCalled();
    provider.clientAccountSid = null;
    invalidateWorkspaceTwilioData(workspaceId);
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test("an original purchase account mismatch stops before provider work", async () => {
    await sql`insert into public.workspace_number_purchase
      (id, workspace, actor_user_id, phone_number, account_sid, credits, state, lease_token, lease_expires_at, provider_sid)
      values (${randomUUID()}::uuid, ${workspaceId}::uuid, ${actor}, ${phone}, 'AC00000000000000000000000000009999',
        100, 'completed', ${randomUUID()}::uuid, now(), ${sid})`;
    expect(String((await release()).error)).toContain("could not start");
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await receipt()).toBeUndefined();
  });
  test("two concurrent requests own one release and report the other as incomplete", async () => {
    let entered!: () => void, allow!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      allow = resolve;
    });
    provider.remove.mockImplementationOnce(async (id: string) => {
      entered();
      await gate;
      provider.active.delete(id);
      return true;
    });
    const first = release();
    await started;
    try {
      expect(String((await release()).error)).toContain("Release incomplete");
    } finally {
      allow();
    }
    expect((await first).error).toBeNull();
    expect(provider.remove).toHaveBeenCalledOnce();
    await expectClean();
  });
  test("an expired token cannot perform provider work after recovery claims ownership", async () => {
    const storage = await import("@/server/number-release-intent.server");
    const first = await storage.beginNumberRelease(
      workspaceId,
      Number(numberId),
      provider.accountSid,
    );
    await sql`update workspace_number_release set lease_expires_at = now() - interval '1 minute' where id = ${first.release.id}::uuid`;
    const [claimed] = await storage.claimNumberReleaseRecovery();
    expect(claimed.id).toBe(first.release.id);
    expect(claimed.lease_token).not.toBe(first.release.lease_token);
    const twilio = await service.createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });
    const { resumeNumberRelease } = await import("@/lib/number-release.server");
    await expect(resumeNumberRelease(first.release, twilio)).rejects.toThrow(
      "no longer owned",
    );
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    await resumeNumberRelease(claimed, twilio);
    await expectClean();
  });
  test("completed provider work finishes without credentials through recovery", async () => {
    await installFault(
      "workspace_number",
      "delete",
      `OLD.workspace = '${workspaceId}'::uuid`,
    );
    expect((await release()).error).toBeTruthy();
    await clearFault();
    await sql`update public.workspace set twilio_data = twilio_data - 'sid' - 'authToken' where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    await expireRelease();
    const { runNumberReleaseRecovery } =
      await import("@/lib/number-release-recovery.server");
    expect(await runNumberReleaseRecovery()).toEqual({
      examined: 1,
      completed: 1,
      pending: 0,
    });
    expect(provider.remove).toHaveBeenCalledOnce();
    await expectClean();
  });
  test("recovery retains failing work and retries it on the next run", async () => {
    await installFault(
      "workspace_number",
      "delete",
      `OLD.workspace = '${workspaceId}'::uuid`,
    );
    expect((await release()).error).toBeTruthy();
    await expireRelease();
    const { runNumberReleaseRecovery } =
      await import("@/lib/number-release-recovery.server");
    expect(await runNumberReleaseRecovery()).toEqual({
      examined: 1,
      completed: 0,
      pending: 1,
    });
    expect(await receipt()).toMatchObject({ state: "released" });
    await clearFault();
    await expireRelease();
    expect(await runNumberReleaseRecovery()).toEqual({
      examined: 1,
      completed: 1,
      pending: 0,
    });
    await expectClean();
  });
  test("final cleanup rejects a local row replaced while the provider call is pending", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      await sql`update public.workspace_number set created_at = '2050-01-01T00:00:00Z' where id = ${numberId.toString()}::bigint`;
      provider.active.delete(id);
      return true;
    });
    expect(String((await release()).error)).toContain("Release incomplete");
    const [row] =
      await sql`select created_at from public.workspace_number where id = ${numberId.toString()}::bigint`;
    expect(row).toBeDefined();
    expect(new Date(row.created_at).toISOString()).toBe(
      "2050-01-01T00:00:00.000Z",
    );
    expect(await receipt()).toMatchObject({ state: "released" });
  });
  test("final identity stays locked against a writer after the final read", async () => {
    await checkNumberReleaseFinalWrite({
      sql,
      workspaceId,
      numberId,
      release,
      armBarrier: (install) => {
        provider.remove.mockImplementationOnce(async (id: string) => {
          provider.active.delete(id);
          await install();
          return true;
        });
      },
    });
    await expectClean();
  });
  test("fresh final bookkeeping preserves concurrent onboarding changes", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      const { updateWorkspaceMessagingOnboardingState } =
        await import("@/lib/messaging-onboarding/persistence.server");
      await updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: actor,
        updates: {
          messagingService: {
            attachedSenderPhoneNumbers: [phone, otherPhone, "+14165550287"],
          },
          businessProfile: { legalBusinessName: "Concurrent name" },
        },
      });
      provider.active.delete(id);
      return true;
    });
    expect((await release()).error).toBeNull();
    expect(await state()).toMatchObject({
      numbers: 0,
      attached: [otherPhone, "+14165550287"],
      fixtureSetting: "preserve",
    });
    const [row] =
      await sql`select twilio_data from public.workspace where id = ${workspaceId}::uuid`;
    expect(row.twilio_data.onboarding.businessProfile.legalBusinessName).toBe(
      "Concurrent name",
    );
  });
  test("bookkeeping failure after provider deletion is incomplete and retryable", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      provider.active.delete(id);
      await installFault(
        "workspace",
        "update of twilio_data",
        `OLD.id = '${workspaceId}'::uuid`,
      );
      return true;
    });
    expect(String((await release()).error)).toContain(
      `Release incomplete for ${phone}`,
    );
    expect(await state()).toMatchObject({
      active: false,
      numbers: 1,
      attached: [otherPhone],
      live: [otherPhone],
    });
    expect(await receipt()).toMatchObject({ state: "released" });
    await clearFault();
    expect((await release()).error).toBeNull();
    expect(provider.remove).toHaveBeenCalledOnce();
    await expectClean();
  });
  test("a Messaging Service changed during provider deletion requires sender cleanup before success", async () => {
    const nextService = "MG00000000000000000000000000002086";
    provider.remove.mockImplementationOnce(async (id: string) => {
      const { updateWorkspaceMessagingOnboardingState } =
        await import("@/lib/messaging-onboarding/persistence.server");
      await updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: actor,
        updates: {
          messagingService: {
            serviceSid: nextService,
            attachedSenderPhoneNumbers: [phone, otherPhone],
          },
        },
      });
      provider.pools.set(nextService, new Set([sid, otherSid]));
      provider.active.delete(id);
      return true;
    });
    expect(String((await release()).error)).toContain(
      `Release incomplete for ${phone}`,
    );
    expect(await state()).toMatchObject({ numbers: 1, active: false });
    expect(await receipt()).toMatchObject({
      state: "releasing",
      messaging_service_sids: [serviceSid, nextService],
    });
    expect((await release()).error).toBeNull();
    expect(provider.pools.get(nextService)).toEqual(new Set([otherSid]));
    await expectClean();
  });
  test("missing retry credentials keep the known partial state instead of claiming nothing was released", async () => {
    provider.remove.mockImplementationOnce(async (id: string) => {
      provider.active.delete(id);
      throw new Error("Synthetic lost acknowledgement");
    });
    expect((await release()).error).toBeTruthy();
    await sql`update public.workspace set twilio_data = twilio_data - 'sid' - 'authToken' where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    expect(String((await release()).error)).toContain(
      `Release incomplete for ${phone}`,
    );
    expect(await receipt()).toMatchObject({ state: "releasing" });
    expect(provider.remove).toHaveBeenCalledOnce();
    await sql`update public.workspace set twilio_data = twilio_data || ${sql.json({ sid: provider.accountSid, authToken: "synthetic-release-token" })} where id = ${workspaceId}::uuid`;
    invalidateWorkspaceTwilioData(workspaceId);
    expect((await release()).error).toBeNull();
    await expectClean();
  });
  test("a known release finishes after the local row was already removed", async () => {
    await installFault(
      "workspace_number",
      "delete",
      `OLD.workspace = '${workspaceId}'::uuid`,
    );
    expect((await release()).error).toBeTruthy();
    await clearFault();
    await sql`delete from public.workspace_number where workspace = ${workspaceId}::uuid and id = ${numberId.toString()}::bigint`;
    expect((await release()).error).toBeNull();
    expect(provider.remove).toHaveBeenCalledOnce();
    await expectClean();
  });
  test("actual API returns 409 for incomplete release and 200 after retry", async () => {
    await installFault(
      "workspace_number",
      "delete",
      `OLD.workspace = '${workspaceId}'::uuid`,
    );
    const first = await api();
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({
      error: `Release incomplete for ${phone}. Retry to finish sender cleanup and number release.`,
    });
    await clearFault();
    const retry = await api();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ success: true });
    await expectClean();
  });
  test("actual form returns 409 for incomplete release and preserves success shape", async () => {
    await installFault(
      "workspace_number",
      "delete",
      `OLD.workspace = '${workspaceId}'::uuid`,
    );
    const first = await form();
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({
      error: `Release incomplete for ${phone}. Retry to finish sender cleanup and number release.`,
    });
    await clearFault();
    const retry = await form();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toBeNull();
    await expectClean();
  });
  test.each([{ surface: "api" }, { surface: "form" }])(
    "$surface denies Caller before release starts",
    async ({ surface }) => {
      const response =
        surface === "api" ? await api(caller) : await form(caller, "caller");
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/permission/),
      });
      if (surface === "api") expect(response.status).toBe(403);
      expect(await receipt()).toBeUndefined();
      expect(provider.fetch).not.toHaveBeenCalled();
      expect(provider.remove).not.toHaveBeenCalled();
    },
  );
  test("API denies a non-member before provider or tenant work", async () => {
    expect((await api(randomUUID())).status).toBe(404);
    expect(await receipt()).toBeUndefined();
    expect(provider.remove).not.toHaveBeenCalled();
  });
  test("a foreign number and unknown number cannot become successful completed retries", async () => {
    expect(
      (
        await service.removeWorkspacePhoneNumber({
          workspaceId: foreignWorkspace,
          numberId,
        })
      ).error,
    ).toBeTruthy();
    expect(
      (
        await service.removeWorkspacePhoneNumber({
          workspaceId,
          numberId: 9007199254740990n,
        })
      ).error,
    ).toBeTruthy();
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await state()).toMatchObject({ active: true, numbers: 1 });
  });
});
