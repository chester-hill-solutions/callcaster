import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import type { Twilio } from "twilio";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  FOREIGN_SID,
  REGULATORY_SID,
  numberAddressProvider,
} from "../helpers/number-address-provider";

vi.hoisted(() => {
  process.env.TZ = "UTC";
  process.env.BASE_URL = "http://localhost:3038";
});
const boundary = vi.hoisted(() => ({ client: null as Twilio | null }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => {
    if (!boundary.client) throw new Error("Provider fixture not ready");
    return boundary.client;
  },
}));
vi.mock(
  "@/lib/database/workspace-twilio-config.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/database/workspace-twilio-config.server")
    >()),
    deriveAndPersistWorkspaceThroughput: async () => undefined,
  }),
);
vi.mock(
  "@/lib/database/workspace-twilio-sync.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/database/workspace-twilio-sync.server")
    >()),
    syncWorkspaceTwilioSnapshot: async () => undefined,
  }),
);
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitTransactionHistoryInsertEvent: async () => undefined,
}));

const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID(),
  actor = randomUUID();
const schemaName = `address_${randomUUID().replaceAll("-", "")}`;
const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
};
let fixture: postgres.Sql;
let service: typeof import("@/lib/platform-workspace-numbers.server");
let pools: typeof import("@/server/db");
let provider: ReturnType<typeof numberAddressProvider>;
const phone = "+14165550214";

describe("regulatory number purchase through SDK and Postgres (#2144)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("Owned database URL required");
    fixture = postgres(url, { max: 1 });
    await fixture.unsafe(`create schema "${schemaName}"`);
    const migration = await readFile(
      new URL(
        "../../client/migrations/20261006000000_number_purchase_recovery.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await fixture.unsafe(
      migration.replaceAll(
        "public.workspace_number_purchase",
        `"${schemaName}".workspace_number_purchase`,
      ),
    );
    const scopedUrl = new URL(url);
    scopedUrl.searchParams.set("search_path", `${schemaName},public`);
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.DATABASE_DIRECT_URL = scopedUrl.toString();
    await fixture`insert into public."user" (id, username, created_at) values (${actor}::uuid, ${`address-${actor}@example.test`}, now())`;
    await fixture`insert into public.workspace (id, name, credits, twilio_data, disabled, feature_flags) values (${workspaceId}::uuid, 'Owned address fixture', 100, '{}'::jsonb, false, '{}'::jsonb)`;
    await fixture`insert into public.workspace_member (id, workspace_id, user_id, role_id) values (${`address:${workspaceId}`}, ${workspaceId}, ${actor}, 'owner')`;
    pools = await import("@/server/db");
    service = await import("@/lib/platform-workspace-numbers.server");
  });
  afterAll(async () => {
    const failures: unknown[] = [];
    try {
      if (fixture) {
        for (const query of [
          () =>
            fixture`delete from public.workspace_number where workspace = ${workspaceId}::uuid`,
          () =>
            fixture`delete from public.transaction_history where workspace = ${workspaceId}::uuid`,
          () => fixture.unsafe(`drop schema if exists "${schemaName}" cascade`),
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
        "Owned address fixture cleanup failed",
      );
  });
  beforeEach(async () => {
    provider = numberAddressProvider();
    boundary.client = provider.twilio;
    await fixture`delete from public.workspace_number where workspace = ${workspaceId}::uuid`;
    await fixture`delete from public.transaction_history where workspace = ${workspaceId}::uuid`;
    await fixture.unsafe(
      `delete from "${schemaName}".workspace_number_purchase`,
    );
    const twilioData = {
      onboarding: {
        emergencyVoice: {
          address: {
            street: "1 Fixture Street",
            city: "Toronto",
            region: "ON",
            postalCode: "M5V 1A1",
            countryCode: "CA",
            status: "not_started",
          },
        },
        messagingService: { serviceSid: null },
      },
    };
    await fixture`update public.workspace set credits = 100, twilio_data = ${fixture.json(twilioData)} where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  });
  async function unchanged() {
    const [row] = await fixture`select credits,
      (select count(*)::int from public.workspace_number where workspace = ${workspaceId}::uuid) as numbers,
      (select count(*)::int from public.transaction_history where workspace = ${workspaceId}::uuid) as ledger
      from public.workspace where id = ${workspaceId}::uuid`;
    expect({
      credits: Number(row.credits),
      numbers: row.numbers,
      ledger: row.ledger,
    }).toEqual({ credits: 100, numbers: 0, ledger: 0 });
    const [holds] = await fixture.unsafe(
      `select count(*)::int as n from "${schemaName}".workspace_number_purchase where state not in ('completed','cancelled')`,
    );
    expect(holds.n).toBe(0);
  }
  test("missing local address returns 400 before create and preserves the rental budget", async () => {
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({
      ok: false,
      status: 400,
      addressRequirementError: true,
      error:
        "This number requires a validated CA address on file. Add one in Numbers settings, then retry.",
    });
    expect(provider.creates()).toHaveLength(0);
    await unchanged();
  });
  test("unvalidated local and validated foreign addresses cannot meet a local requirement", async () => {
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: false },
      { sid: FOREIGN_SID, iso_country: "US", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ status: 400, addressRequirementError: true });
    expect(provider.creates()).toHaveLength(0);
    await unchanged();
  });
  test("compliant local address is sent as AddressSid and one rental is debited", async () => {
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true, status: 201 });
    expect(provider.creates()).toHaveLength(1);
    expect(provider.creates()[0].data).toMatchObject({
      AddressSid: REGULATORY_SID,
      PhoneNumber: phone,
    });
    expect(provider.creates()[0].data).not.toHaveProperty(
      "EmergencyAddressSid",
    );
    const [row] =
      await fixture`select credits from public.workspace where id = ${workspaceId}::uuid`;
    expect(Number(row.credits)).toBe(0);
    const [ledger] =
      await fixture`select count(*)::int as n from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(ledger.n).toBe(1);
  });
  test("foreign requirement selects the validated address outside CA", async () => {
    provider.state.requirement = "foreign";
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
      { sid: FOREIGN_SID, iso_country: "US", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true });
    expect(provider.creates()[0].data.AddressSid).toBe(FOREIGN_SID);
  });
  test("an address on the second provider page is considered", async () => {
    provider.state.addresses = [
      { sid: FOREIGN_SID, iso_country: "US", validated: true },
    ];
    provider.state.nextAddresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true });
    expect(provider.creates()[0].data.AddressSid).toBe(REGULATORY_SID);
    expect(
      provider.request.mock.calls.some(([args]) =>
        args.uri.includes("PageToken=tail"),
      ),
    ).toBe(true);
  });
  test("none requires no address query or AddressSid", async () => {
    provider.state.requirement = "none";
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true });
    expect(provider.creates()[0].data).not.toHaveProperty("AddressSid");
    expect(
      provider.request.mock.calls.some(([args]) =>
        args.uri.includes("/Addresses.json"),
      ),
    ).toBe(false);
  });
  test("toll-free inventory is checked on the purchasing account", async () => {
    provider.state.requirement = "any";
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, "+18885550214"),
    ).toMatchObject({ ok: true });
    expect(
      provider.request.mock.calls.some(
        ([args]) =>
          args.uri.includes("/CA/TollFree.json") &&
          args.params?.Contains === "+18885550214",
      ),
    ).toBe(true);
    expect(provider.creates()[0].data.AddressSid).toBe(REGULATORY_SID);
  });
  test.each([
    { available: false, inventoryPhone: undefined },
    { available: true, inventoryPhone: "+14165550215" },
  ])(
    "absent exact inventory stops before create: $available/$inventoryPhone",
    async (input) => {
      Object.assign(provider.state, input);
      expect(
        await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
      ).toMatchObject({ ok: false, status: 409 });
      expect(provider.creates()).toHaveLength(0);
      await unchanged();
    },
  );
  test("failed inventory lookup does not create or strand a budget hold", async () => {
    provider.state.lookupFailure = true;
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: false });
    expect(provider.creates()).toHaveLength(0);
    await unchanged();
  });
  test.each([18018, 21615, 21631, 21628, 21629])(
    "confirmed address rejection %s returns 400 and safely cancels the hold",
    async (code) => {
      provider.state.addresses = [
        { sid: REGULATORY_SID, iso_country: "CA", validated: true },
      ];
      provider.state.createCode = code;
      expect(
        await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
      ).toMatchObject({
        ok: false,
        status: 400,
        addressRequirementError: true,
        error: expect.stringContaining("address"),
      });
      expect(provider.creates()).toHaveLength(1);
      await unchanged();
    },
  );
  test("SMS error 21614 is not treated as an address rejection", async () => {
    provider.state.requirement = "none";
    provider.state.createCode = 21614;
    const result = await service.purchaseWorkspaceNumber(
      actor,
      workspaceId,
      phone,
    );
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(result).not.toHaveProperty("addressRequirementError");
    await unchanged();
  });
  test("an address returned for another account cannot authorize purchase", async () => {
    provider.state.addresses = [
      {
        sid: REGULATORY_SID,
        iso_country: "CA",
        validated: true,
        account_sid: `AC${"9".repeat(32)}`,
      },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ status: 400, addressRequirementError: true });
    expect(provider.creates()).toHaveLength(0);
    await unchanged();
  });
  async function validateEmergencyAddress() {
    const emergency = {
      street: "1 Fixture Street",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 1A1",
      countryCode: "CA",
      status: "validated",
      addressSid: `AD${"8".repeat(32)}`,
    };
    await fixture`update public.workspace set twilio_data = jsonb_set(twilio_data::jsonb, '{onboarding,emergencyVoice,address}', ${fixture.json(emergency)}::jsonb) where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } =
      await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  }
  test("a validated E911 address does not replace missing regulatory account data", async () => {
    await validateEmergencyAddress();
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ status: 400, addressRequirementError: true });
    expect(provider.creates()).toHaveLength(0);
    await unchanged();
  });
  test("E911 and regulatory SIDs remain distinct on the SDK request", async () => {
    await validateEmergencyAddress();
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
    ];
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true });
    expect(provider.creates()[0].data).toMatchObject({
      AddressSid: REGULATORY_SID,
      EmergencyAddressSid: `AD${"8".repeat(32)}`,
    });
  });
  test("insufficient credits stop before provider inventory reads", async () => {
    await fixture`update public.workspace set credits = 99 where id = ${workspaceId}::uuid`;
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ status: 402 });
    expect(provider.request).not.toHaveBeenCalled();
  });
  test("an already-owned number does not repeat inventory lookup, create or debit", async () => {
    provider.state.requirement = "none";
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: true });
    const count = provider.request.mock.calls.length;
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: false, status: 409 });
    expect(provider.request.mock.calls).toHaveLength(count);
    const [ledger] =
      await fixture`select count(*)::int as n from public.transaction_history where workspace = ${workspaceId}::uuid`;
    expect(ledger.n).toBe(1);
  });
  test("an uncertain provider response with an address code keeps its recovery hold", async () => {
    provider.state.addresses = [
      { sid: REGULATORY_SID, iso_country: "CA", validated: true },
    ];
    provider.state.createCode = 21631;
    provider.state.createStatus = 500;
    const result = await service.purchaseWorkspaceNumber(
      actor,
      workspaceId,
      phone,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringContaining("Do not retry"),
    });
    expect(result).not.toHaveProperty("addressRequirementError");
    expect(provider.creates()).toHaveLength(1);
    const [holds] = await fixture.unsafe(
      `select count(*)::int as n from "${schemaName}".workspace_number_purchase where state not in ('completed','cancelled')`,
    );
    expect(holds.n).toBe(1);
    const count = provider.request.mock.calls.length;
    expect(
      await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
    ).toMatchObject({ ok: false, status: 409 });
    expect(provider.request.mock.calls).toHaveLength(count);
  });
  test("a pre-create cancellation failure cannot expose a retry or release the hold", async () => {
    await fixture.unsafe(
      `create function "${schemaName}".refuse_cancel() returns trigger language plpgsql as $$ begin if new.state = 'cancelled' then raise exception 'Owned cancellation fault'; end if; return new; end $$`,
    );
    await fixture.unsafe(
      `create trigger refuse_cancel before update on "${schemaName}".workspace_number_purchase for each row execute function "${schemaName}".refuse_cancel()`,
    );
    try {
      expect(
        await service.purchaseWorkspaceNumber(actor, workspaceId, phone),
      ).toMatchObject({
        ok: false,
        status: 409,
        error: expect.stringContaining("Do not retry"),
      });
      expect(provider.creates()).toHaveLength(0);
      const [holds] = await fixture.unsafe(
        `select count(*)::int as n from "${schemaName}".workspace_number_purchase where state not in ('completed','cancelled')`,
      );
      expect(holds.n).toBe(1);
    } finally {
      await fixture.unsafe(
        `drop trigger refuse_cancel on "${schemaName}".workspace_number_purchase`,
      );
      await fixture.unsafe(`drop function "${schemaName}".refuse_cancel()`);
    }
  });
});
