import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { asRouteResponse } from "../helpers/route-result";
import {
  RELEASE_ACCOUNT,
  RELEASE_NEW_KEY,
  RELEASE_NUMBER,
  RELEASE_OLD_KEY,
  RELEASE_PARENT,
  RELEASE_PHONE,
  RELEASE_SERVICE,
  numberReleaseAuthProvider,
} from "../helpers/number-release-auth-provider";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.BASE_URL = "http://localhost:3038";
});
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      TWILIO_SID: () => `AC${"2".repeat(32)}`,
      TWILIO_AUTH_TOKEN: () => "owned-parent-token",
    },
  };
});
vi.mock(
  "@/lib/database/workspace-twilio-sync.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/database/workspace-twilio-sync.server")
    >()),
    syncWorkspaceTwilioSnapshot: async () => {
      throw new Error(
        "Release repair must not run full workspace synchronization",
      );
    },
  }),
);

const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID();
const actor = randomUUID();
const publicControl = randomUUID(),
  publicLease = randomUUID();
const schemaName = `release_auth_${randomUUID().replaceAll("-", "")}`;
const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
};
let fixture: postgres.Sql;
let pools: typeof import("@/server/db");
let service: typeof import("@/lib/database/workspace.server");
let provider: ReturnType<typeof numberReleaseAuthProvider>;
let numberId: bigint;

describe("number release credential recovery through SDK and PostgreSQL (#2170)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("Owned database URL required");
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
    const scoped = new URL(url);
    scoped.searchParams.set("search_path", `${schemaName},public`);
    process.env.DATABASE_URL = scoped.toString();
    process.env.DATABASE_DIRECT_URL = scoped.toString();
    await fixture`insert into public.workspace (id, name, credits, twilio_data, disabled, feature_flags) values (${workspaceId}::uuid, 'Owned release auth fixture', 100, '{}'::jsonb, false, '{}'::jsonb)`;
    await fixture`insert into public."user" (id, username, created_at) values (${actor}::uuid, ${`release-auth-${actor}@example.test`}, now())`;
    await fixture`insert into public.workspace_member (id, workspace_id, user_id, role_id) values (${`release-auth:${workspaceId}`}, ${workspaceId}, ${actor}, 'owner')`;
    await fixture`insert into public.workspace_number_release (id, workspace, number_id, number_created_at, number_type, phone_number, account_sid, lease_token, lease_expires_at) values (${publicControl}::uuid, ${workspaceId}::uuid, 9007199254740800, 'control', 'local', '+14165550998', ${RELEASE_ACCOUNT}, ${publicLease}::uuid, now() - interval '1 day')`;
    pools = await import("@/server/db");
    service = await import("@/lib/database/workspace.server");
  });
  afterAll(async () => {
    const failures: unknown[] = [];
    try {
      if (fixture)
        for (const query of [
          () =>
            fixture`delete from public.workspace_number where workspace = ${workspaceId}::uuid`,
          () => fixture.unsafe(`drop schema if exists "${schemaName}" cascade`),
          () =>
            fixture`delete from public.workspace_number_release where id = ${publicControl}::uuid`,
          () =>
            fixture`delete from public.workspace_member where workspace_id = ${workspaceId}`,
          () =>
            fixture`delete from public.workspace where id = ${workspaceId}::uuid`,
          () => fixture`delete from public."user" where id = ${actor}::uuid`,
        ]) {
          try {
            await query();
          } catch (error) {
            failures.push(error);
          }
        }
    } finally {
      try {
        for (const close of [
          () => pools?.pool.end(),
          () => pools?.directPool.end(),
          () => fixture?.end(),
        ]) {
          try {
            await close();
          } catch (error) {
            failures.push(error);
          }
        }
      } finally {
        for (const [key, value] of Object.entries(originalEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Owned release credential fixture cleanup failed",
      );
  });
  beforeEach(async () => {
    provider = numberReleaseAuthProvider();
    await fixture.unsafe(
      `delete from "${schemaName}".workspace_number_release`,
    );
    await fixture`delete from public.workspace_number where workspace = ${workspaceId}::uuid`;
    const data = {
      sid: RELEASE_ACCOUNT,
      authToken: "stored-fixture-token",
      fixtureSetting: "preserve",
      onboarding: {
        messagingService: {
          serviceSid: RELEASE_SERVICE,
          desiredSendMode: "messaging_service",
          attachedSenderPhoneNumbers: [RELEASE_PHONE],
        },
      },
    };
    await fixture`update public.workspace set key = ${RELEASE_OLD_KEY}, token = 'stored-fixture-secret', twilio_data = ${fixture.json(data)} where id = ${workspaceId}::uuid`;
    const [number] =
      await fixture`insert into public.workspace_number (workspace, type, phone_number, twilio_phone_number_sid) values (${workspaceId}::uuid, 'local', ${RELEASE_PHONE}, ${RELEASE_NUMBER}) returning id`;
    numberId = BigInt(number.id);
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  });
  const release = () =>
    service.removeWorkspacePhoneNumber({ workspaceId, numberId });
  async function receipt() {
    const [row] = await fixture.unsafe(
      `select state, account_sid from "${schemaName}".workspace_number_release where workspace = $1::uuid`,
      [workspaceId],
    );
    return row;
  }
  async function completed() {
    expect(provider.state.active).toBe(false);
    expect(provider.state.attached).toBe(false);
    expect(await receipt()).toMatchObject({
      state: "completed",
      account_sid: RELEASE_ACCOUNT,
    });
    const [row] =
      await fixture`select key, token, twilio_data, (select count(*)::int from public.workspace_number where workspace = ${workspaceId}::uuid) as numbers from public.workspace where id = ${workspaceId}::uuid`;
    expect(row.numbers).toBe(0);
    expect(row.twilio_data.fixtureSetting).toBe("preserve");
    return row;
  }
  test("valid API key releases without account lookup or credential mint", async () => {
    expect((await release()).error).toBeNull();
    await completed();
    expect(provider.accountReads()).toHaveLength(0);
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(2);
  });
  test("completed release replay performs no further provider operation", async () => {
    expect((await release()).error).toBeNull();
    const calls = provider.calls().length;
    expect((await release()).error).toBeNull();
    expect(provider.calls()).toHaveLength(calls);
    await completed();
  });
  test("rejected API key repairs on the original owned subaccount and finishes release", async () => {
    provider.state.rejectOldKey = true;
    expect((await release()).error).toBeNull();
    const row = await completed();
    expect(row.key).toBe(RELEASE_NEW_KEY);
    expect(row.token).toBe("new-fixture-secret");
    expect(provider.accountReads()).toHaveLength(1);
    expect(provider.keyCreates()).toHaveLength(1);
    expect(
      provider.deletes().every((r) => r.username === RELEASE_NEW_KEY),
    ).toBe(true);
    expect(provider.accountReads()[0].username).toBe(RELEASE_PARENT);
  });
  test("rejected stored Auth Token recovers with the verified current subaccount token", async () => {
    await fixture`update public.workspace set key = null, token = null where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    provider.state.rejectStoredToken = true;
    expect((await release()).error).toBeNull();
    const rejectedIndex = provider.calls().findIndex((request) =>
      request.username === RELEASE_ACCOUNT &&
      request.password === "stored-fixture-token",
    );
    expect(rejectedIndex).toBeGreaterThanOrEqual(0);
    const rejectedResponse =
      await provider.request.mock.results[rejectedIndex].value;
    expect(rejectedResponse.statusCode).toBe(401);
    expect(JSON.parse(rejectedResponse.body).code).toBe(20003);
    const row = await completed();
    expect(row.key).toBe(RELEASE_NEW_KEY);
    expect(row.token).toBe("new-fixture-secret");
    expect(row.twilio_data.authToken).toBe("current-fixture-token");
    expect(provider.accountReads()).toHaveLength(1);
    expect(provider.keyCreates()).toHaveLength(1);
    expect(provider.keyCreates()[0].password).toBe("current-fixture-token");
    expect(provider.deletes().every((r) => r.username === RELEASE_NEW_KEY)).toBe(true);
  });
  test.each([
    {
      name: "foreign owner",
      field: "owner" as const,
      value: `AC${"7".repeat(32)}`,
    },
    {
      name: "changed account",
      field: "account" as const,
      value: `AC${"8".repeat(32)}`,
    },
    { name: "suspended account", field: "status" as const, value: "suspended" },
    { name: "missing current token", field: "authToken" as const, value: "" },
  ])(
    "$name prevents credential mint and provider deletion",
    async ({ field, value }) => {
      provider.state.rejectOldKey = true;
      provider.state[field] = value;
      const result = await release();
      expect(result.error?.name).toBe("NumberReleaseCredentialError");
      expect(String(result.error)).toContain("provider connection");
      expect(provider.keyCreates()).toHaveLength(0);
      expect(provider.deletes()).toHaveLength(0);
      expect(provider.state.active).toBe(true);
      expect(await receipt()).toMatchObject({ state: "prepared" });
    },
  );
  test("a recovered key rejected again stops with a named degraded state", async () => {
    provider.state.rejectOldKey = true;
    provider.state.rejectNewKey = true;
    const result = await release();
    expect(result.error?.name).toBe("NumberReleaseCredentialError");
    expect(provider.accountReads()).toHaveLength(1);
    expect(provider.keyCreates()).toHaveLength(1);
    expect(provider.deletes()).toHaveLength(0);
    expect(provider.state.active).toBe(true);
  });
  test("sender-detach rejection recovers with a subaccount key across both API domains", async () => {
    provider.state.rejectSenderKey = true;
    expect((await release()).error).toBeNull();
    await completed();
    const succeeded = provider
      .deletes()
      .filter((r) => r.username === RELEASE_NEW_KEY);
    expect(succeeded).toHaveLength(2);
    expect(new Set(succeeded.map((r) => new URL(r.uri).hostname))).toEqual(
      new Set(["messaging.twilio.com", "api.twilio.com"]),
    );
    expect(provider.accountReads()).toHaveLength(1);
    expect(provider.keyCreates()).toHaveLength(1);
  });
  test("resource changed during sender repair is rechecked before any recovered delete", async () => {
    provider.state.rejectSenderKey = true;
    provider.state.onAccountRead = async () => {
      provider.state.resourceAccount = `AC${"8".repeat(32)}`;
    };
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    expect(
      provider.deletes().filter((r) => r.username === RELEASE_NEW_KEY),
    ).toHaveLength(0);
    expect(provider.state.active).toBe(true);
    expect(provider.state.attached).toBe(true);
    expect(await receipt()).toMatchObject({ state: "releasing" });
  });
  test("another completed credential repair is reused without another mint", async () => {
    provider.state.rejectOldKey = true;
    provider.state.onRejectedKey = async () => {
      await fixture`update public.workspace set key = ${RELEASE_NEW_KEY}, token = 'new-fixture-secret' where id = ${workspaceId}::uuid`;
    };
    expect((await release()).error).toBeNull();
    await completed();
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.accountReads()).toHaveLength(0);
    const cached = await service.createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });
    expect(cached.username).toBe(RELEASE_NEW_KEY);
  });
  test("account changes during parent lookup prevent mint and deletion", async () => {
    provider.state.rejectOldKey = true;
    provider.state.onAccountRead = async () => {
      await fixture`update public.workspace set twilio_data = jsonb_set(twilio_data, '{sid}', ${fixture.json(`AC${"8".repeat(32)}`)}) where id = ${workspaceId}::uuid`;
    };
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(0);
  });
  test("expired release lease during lookup prevents credential mint", async () => {
    provider.state.rejectOldKey = true;
    provider.state.onAccountRead = async () => {
      await fixture.unsafe(
        `update "${schemaName}".workspace_number_release set lease_expires_at = now() - interval '1 minute' where workspace = $1::uuid`,
        [workspaceId],
      );
    };
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(0);
  });
  test("concurrent credential write at mint is not overwritten", async () => {
    provider.state.rejectOldKey = true;
    provider.state.onKeyCreate = async () => {
      await fixture`update public.workspace set key = ${`SK${"9".repeat(32)}`}, token = 'concurrent-secret' where id = ${workspaceId}::uuid`;
    };
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    const [row] =
      await fixture`select key, token from public.workspace where id = ${workspaceId}::uuid`;
    expect(row).toEqual({
      key: `SK${"9".repeat(32)}`,
      token: "concurrent-secret",
    });
    expect(provider.deletes()).toHaveLength(0);
  });
  test("changed recovered provider number cannot be deleted", async () => {
    provider.state.rejectOldKey = true;
    provider.state.resourceAccount = `AC${"8".repeat(32)}`;
    expect((await release()).error).not.toBeNull();
    expect(provider.deletes()).toHaveLength(0);
    expect(provider.state.active).toBe(true);
  });
  test("lease lost at key receipt prevents credential persistence", async () => {
    provider.state.rejectOldKey = true;
    provider.state.onKeyCreate = async () => {
      await fixture.unsafe(
        `update "${schemaName}".workspace_number_release set lease_expires_at = now() - interval '1 minute' where workspace = $1::uuid`,
        [workspaceId],
      );
    };
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    const [row] =
      await fixture`select key from public.workspace where id = ${workspaceId}::uuid`;
    expect(row.key).toBe(RELEASE_OLD_KEY);
    expect(provider.deletes()).toHaveLength(0);
  });
  test.each([
    { name: "invalid key SID", sid: "SKinvalid", secret: "new-fixture-secret" },
    { name: "missing key secret", sid: RELEASE_NEW_KEY, secret: "" },
  ])(
    "$name does not replace the stored credentials",
    async ({ sid, secret }) => {
      provider.state.rejectOldKey = true;
      provider.state.keySid = sid;
      provider.state.keySecret = secret;
      expect((await release()).error?.name).toBe(
        "NumberReleaseCredentialError",
      );
      const [row] =
        await fixture`select key, token from public.workspace where id = ${workspaceId}::uuid`;
      expect(row).toEqual({
        key: RELEASE_OLD_KEY,
        token: "stored-fixture-secret",
      });
      expect(provider.deletes()).toHaveLength(0);
    },
  );
  test("background recovery repairs only its isolated pending release", async () => {
    provider.state.rejectOldKey = true;
    provider.state.status = "suspended";
    expect((await release()).error?.name).toBe("NumberReleaseCredentialError");
    provider.state.status = "active";
    await fixture.unsafe(
      `update "${schemaName}".workspace_number_release set lease_expires_at = now() - interval '1 minute' where workspace = $1::uuid`,
      [workspaceId],
    );
    const { runNumberReleaseRecovery } =
      await import("@/lib/number-release-recovery.server");
    expect(await runNumberReleaseRecovery()).toEqual({
      examined: 1,
      completed: 1,
      pending: 0,
    });
    await completed();
    const [untouched] =
      await fixture`select state, lease_token from public.workspace_number_release where id = ${publicControl}::uuid`;
    expect(untouched).toEqual({ state: "prepared", lease_token: publicLease });
  });
  test.each([false, true])(
    "caller-ID repair rechecks the saved outgoing resource; changed=%s",
    async (changed) => {
      await fixture`update public.workspace_number set type = 'caller_id' where workspace = ${workspaceId}::uuid`;
      provider.state.outgoing = true;
      provider.state.rejectDeleteKey = true;
      if (changed)
        provider.state.onAccountRead = async () => {
          provider.state.resourceAccount = `AC${"8".repeat(32)}`;
        };
      const result = await release();
      const deletes = provider
        .deletes()
        .filter((r) => r.username === RELEASE_NEW_KEY);
      if (changed) {
        expect(deletes).toHaveLength(0);
        expect(provider.state.active).toBe(true);
        expect(result.error?.name).toBe("NumberReleaseCredentialError");
      } else {
        expect(result.error).toBeNull();
        expect(deletes).toHaveLength(1);
        expect(deletes[0].uri).toContain(
          `/OutgoingCallerIds/${RELEASE_NUMBER}.json`,
        );
        expect(provider.state.active).toBe(false);
        expect(await receipt()).toMatchObject({ state: "completed" });
      }
    },
  );
  test("plain unauthorized response is not credential repair evidence", async () => {
    provider.state.firstFailure = { status: 401, code: 99999 };
    expect((await release()).error).not.toBeNull();
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.accountReads()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(0);
  });
  test("ambiguous provider response before auth rejection prevents repair", async () => {
    provider.state.firstFailure = { status: 500, code: 20003 };
    provider.state.rejectOldKey = true;
    expect((await release()).error).not.toBeNull();
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.accountReads()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(0);
  });
  test.each([
    { target: "sender", kind: "network" },
    { target: "sender", kind: "server" },
    { target: "incoming", kind: "network" },
    { target: "incoming", kind: "server" },
    { target: "outgoing", kind: "network" },
    { target: "outgoing", kind: "server" },
  ] as const)(
    "$target delete with $kind uncertainty stays pending without a second DELETE",
    async ({ target, kind }) => {
      if (target === "outgoing") {
        await fixture`update public.workspace_number set type = 'caller_id' where workspace = ${workspaceId}::uuid`;
        provider.state.outgoing = true;
      }
      provider.state.deleteFailure = { target, kind };
      expect((await release()).error).not.toBeNull();
      const targetDeletes = provider.deletes().filter((request) => {
        const url = new URL(request.uri);
        return target === "sender"
          ? url.hostname === "messaging.twilio.com"
          : url.pathname.includes(
              target === "incoming" ? "/IncomingPhoneNumbers/" : "/OutgoingCallerIds/",
            );
      });
      expect(targetDeletes).toHaveLength(1);
      expect(provider.accountReads()).toHaveLength(0);
      expect(provider.keyCreates()).toHaveLength(0);
      expect(await receipt()).toMatchObject({ state: "releasing" });
      const [row] = await fixture`select count(*)::int as numbers from public.workspace_number where workspace = ${workspaceId}::uuid`;
      expect(row.numbers).toBe(1);
    },
  );
  test("transient read retries retain normal release without credential repair", async () => {
    provider.state.firstFailure = { status: 500, code: 20500 };
    expect((await release()).error).toBeNull();
    await completed();
    const numberReads = provider.calls().filter((request) =>
      request.method.toLowerCase() === "get" &&
      new URL(request.uri).pathname.includes("/IncomingPhoneNumbers/"),
    );
    expect(numberReads).toHaveLength(2);
    expect(provider.accountReads()).toHaveLength(0);
    expect(provider.keyCreates()).toHaveLength(0);
    expect(provider.deletes()).toHaveLength(2);
  });
  test.each(["api", "form"] as const)(
    "%s reports actionable credential degradation as incomplete release",
    async (surface) => {
      provider.state.rejectOldKey = true;
      provider.state.status = "suspended";
      let response;
      if (surface === "api") {
        const { action } =
          await import("@/routes/api+/workspaces+/$workspaceId/numbers/$numberId.action.server");
        const { withDataPlaneRouteArgs } =
          await import("../helpers/route-context-mock");
        response = await asRouteResponse(
          action(
            await withDataPlaneRouteArgs(
              {
                request: new Request(
                  `http://localhost/api/workspaces/${workspaceId}/numbers/${numberId}`,
                  { method: "DELETE" },
                ),
                params: { workspaceId, numberId: numberId.toString() },
              },
              { workspaceId, userId: actor },
            ),
          ),
        );
      } else {
        const { action } =
          await import("@/routes/workspaces+/$id/phone-numbers.action.server");
        const { withWorkspaceRouteArgs } =
          await import("../helpers/route-context-mock");
        response = await asRouteResponse(
          action(
            await withWorkspaceRouteArgs(
              {
                request: new Request(
                  `http://localhost/workspaces/${workspaceId}/phone-numbers`,
                  {
                    method: "POST",
                    body: new URLSearchParams({
                      formName: "remove-number",
                      numberId: numberId.toString(),
                    }),
                  },
                ),
                params: { id: workspaceId },
              },
              { workspaceId, userId: actor, userRole: "owner" },
            ),
          ),
        );
      }
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("provider connection needs repair"),
      });
      expect(provider.deletes()).toHaveLength(0);
      expect(provider.state.active).toBe(true);
    },
  );
});
