import { randomUUID } from "node:crypto";
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

const fixture = vi.hoisted(() => {
  const previous = Object.fromEntries(
    ["DATABASE_URL", "DATABASE_DIRECT_URL", "RESEND_API_KEY", "TZ"].map(
      (key) => [key, process.env[key]],
    ),
  );
  const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_DIRECT_URL = url;
    process.env.RESEND_API_KEY = "re_rental_warning_fixture";
    process.env.TZ = "UTC";
  }
  return {
    url,
    previous,
    email: vi.fn(async (_mail: { subject: string; to: string[] }) => ({
      data: { id: "fixture-mail" },
      error: null,
    })),
    ops: vi.fn(async () => undefined),
  };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: fixture.email };
  },
}));
vi.mock("@/lib/ops-alert.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ops-alert.server")>()),
  notifyOps: fixture.ops,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: () => {
    throw new Error("Unexpected provider request in warning fixture");
  },
  removeWorkspacePhoneNumber: () => {
    throw new Error("Unexpected provider release in warning fixture");
  },
}));

const describeDb = fixture.url ? describe : describe.skip;

describeDb(
  "number rental warning recovery through real billing (#2142)",
  () => {
    const workspace = randomUUID();
    const foreign = randomUUID();
    const owner = randomUUID();
    const foreignOwner = randomUUID();
    const ownerEmail = `rental-${owner}@example.test`;
    let sql: postgres.Sql;
    let run: typeof import("@/lib/number-rental-billing.server").runNumberRentalBilling;
    let foreignNumber: number;

    beforeAll(async () => {
      if (!fixture.url) throw new Error("A database URL is required");
      sql = postgres(fixture.url, { max: 2 });
      await sql`insert into public.auth_user (id, name, email) values
      (${owner}, 'Rental owner', ${ownerEmail}),
      (${foreignOwner}, 'Foreign owner', ${`foreign-${foreignOwner}@example.test`})`;
      await sql`insert into public.workspace (id, name, credits, twilio_data, feature_flags, disabled) values
      (${workspace}::uuid, 'Rental fixture', 0, '{}'::jsonb, '{}'::jsonb, false),
      (${foreign}::uuid, 'Foreign fixture', 0, '{}'::jsonb, '{}'::jsonb, false)`;
      await sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values
      (${randomUUID()}, ${workspace}, ${owner}, 'owner'),
      (${randomUUID()}, ${foreign}, ${foreignOwner}, 'owner')`;
      ({ runNumberRentalBilling: run } =
        await import("@/lib/number-rental-billing.server"));
    });

    beforeEach(async () => {
      fixture.email.mockClear();
      fixture.ops.mockClear();
      await sql`delete from public.transaction_history where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
      await sql`delete from public.workspace_number where workspace in (${workspace}::uuid, ${foreign}::uuid)`;
      await sql`update public.workspace set credits = 0, disabled = false where id in (${workspace}::uuid, ${foreign}::uuid)`;
      foreignNumber = await number({
        workspaceId: foreign,
        marker: 7,
        suspended: true,
      });
    });

    afterAll(async () => {
      try {
        if (sql) {
          await sql`delete from public.workspace_member where workspace_id in (${workspace}, ${foreign})`;
          await sql`delete from public.workspace where id in (${workspace}::uuid, ${foreign}::uuid)`;
          await sql`delete from public.auth_user where id in (${owner}, ${foreignOwner})`;
        }
      } finally {
        await sql?.end();
        if (run) {
          const { pool, directPool } = await import("@/server/db");
          await Promise.all([pool.end(), directPool.end()]);
        }
        for (const [key, value] of Object.entries(fixture.previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    async function number(
      args: {
        workspaceId?: string;
        marker?: number | null;
        suspended?: boolean;
      } = {},
    ) {
      const [row] = await sql`insert into public.workspace_number
      (workspace, type, created_at, phone_number, twilio_phone_number_sid, rental_warned_cycle, suspended_at)
      values (${args.workspaceId ?? workspace}::uuid, 'rented', '2026-04-01', '+15555550123',
      ${`PN${randomUUID().replaceAll("-", "")}`}, ${args.marker ?? null},
      ${args.suspended ? "2026-06-01T00:00:00Z" : null}::timestamptz) returning id`;
      return Number(row.id);
    }

    async function state(id: number) {
      const [row] =
        await sql`select rental_warned_cycle as marker, suspended_at is not null as suspended
      from public.workspace_number where id = ${id}`;
      return row;
    }

    async function credits(amount: number) {
      await sql`update public.workspace set credits = ${amount} where id = ${workspace}::uuid`;
    }

    const sweep = (date: string) =>
      run({ workspaceId: workspace, today: new Date(`${date}T12:00:00Z`) });
    const warningEmails = () =>
      fixture.email.mock.calls.filter(([mail]) =>
        String(mail.subject).startsWith("Payment needed for "),
      );
    const ledger = () =>
      sql`select amount, idempotency_key from public.transaction_history where workspace = ${workspace}::uuid order by id`;

    async function rejectWrites(
      table: "transaction_history" | "workspace_number",
      action: () => Promise<void>,
    ) {
      const name = `rental_warning_failure_${randomUUID().replaceAll("-", "_")}`;
      const condition =
        table === "workspace_number"
          ? " and new.rental_warned_cycle is null"
          : "";
      await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $$
      begin
        if new.workspace = '${workspace}'::uuid${condition} then raise exception 'Owned rental warning rejection'; end if;
        return new;
      end $$`);
      try {
        await sql.unsafe(`create trigger ${name} before ${table === "transaction_history" ? "insert" : "update"}
        on public.${table} for each row execute function public.${name}()`);
        await action();
      } finally {
        await sql.unsafe(`drop trigger if exists ${name} on public.${table}`);
        await sql.unsafe(`drop function public.${name}()`);
      }
    }

    test("warn then pay without suspension then lapse sends a second warning", async () => {
      const id = await number();
      expect(await sweep("2026-05-01")).toMatchObject({
        warned: 1,
        charged: 0,
      });
      await credits(100);
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 1,
        technicalFailures: 0,
      });
      expect(await sweep("2026-06-01")).toMatchObject({
        warned: 1,
        charged: 0,
      });
      expect(warningEmails()).toHaveLength(2);
      expect(
        warningEmails().every(([mail]) => mail.to.includes(ownerEmail)),
      ).toBe(true);
      expect(await state(id)).toMatchObject({ marker: 1, suspended: false });
      expect((await ledger()).map((row) => Number(row.amount))).toEqual([-100]);
    });

    test("warn then suspend then fully pay then lapse sends a second warning", async () => {
      const id = await number();
      expect(await sweep("2026-05-01")).toMatchObject({ warned: 1 });
      expect(await sweep("2026-06-01")).toMatchObject({ suspended: 1 });
      expect(await state(id)).toMatchObject({ marker: 1, suspended: true });
      await credits(200);
      expect(await sweep("2026-06-01")).toMatchObject({
        charged: 2,
        unsuspended: 1,
        technicalFailures: 0,
      });
      expect(await sweep("2026-07-01")).toMatchObject({ warned: 1 });
      expect(warningEmails()).toHaveLength(2);
      expect(await state(id)).toMatchObject({ marker: 1, suspended: false });
      expect((await ledger()).map((row) => Number(row.amount))).toEqual([
        -100, -100,
      ]);
    });

    test("full payment clears a warned but never suspended number", async () => {
      const id = await number({ marker: 1 });
      await credits(100);
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 1,
        warned: 0,
        technicalFailures: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null, suspended: false });
      expect(warningEmails()).toHaveLength(0);
    });

    test("the first unpaid cycle warns once across daily reruns", async () => {
      const id = await number();
      expect(await sweep("2026-05-01")).toMatchObject({ warned: 1 });
      expect(await sweep("2026-05-02")).toMatchObject({ warned: 0 });
      expect(await sweep("2026-05-03")).toMatchObject({ warned: 0 });
      expect(warningEmails()).toHaveLength(1);
      expect(await state(id)).toMatchObject({ marker: 1, suspended: false });
      expect(await ledger()).toHaveLength(0);
    });

    test("a number that pays every cycle is not warned", async () => {
      const id = await number();
      await credits(300);
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 1,
        warned: 0,
      });
      expect(await sweep("2026-06-01")).toMatchObject({
        charged: 1,
        warned: 0,
      });
      expect(await sweep("2026-07-01")).toMatchObject({
        charged: 1,
        warned: 0,
      });
      expect(warningEmails()).toHaveLength(0);
      expect(await state(id)).toMatchObject({ marker: null, suspended: false });
      expect((await ledger()).map((row) => Number(row.amount))).toEqual([
        -100, -100, -100,
      ]);
    });

    test("an already paid cycle clears a retained marker without another debit", async () => {
      const id = await number();
      await credits(200);
      expect(await sweep("2026-05-01")).toMatchObject({ charged: 1 });
      await sql`update public.workspace_number set rental_warned_cycle = 1 where id = ${id}`;
      const before = await ledger();
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 0,
        warned: 0,
        technicalFailures: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null });
      expect(await ledger()).toEqual(before);
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 0,
        warned: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null });
    });

    test("partial catch-up keeps the current warning episode", async () => {
      const id = await number({ marker: 1 });
      await credits(100);
      expect(await sweep("2026-06-01")).toMatchObject({
        charged: 1,
        warned: 0,
        technicalFailures: 0,
      });
      expect(await state(id)).toMatchObject({ marker: 1 });
      expect(warningEmails()).toHaveLength(0);
      expect((await ledger()).map((row) => Number(row.amount))).toEqual([-100]);
    });

    test("a ledger failure retains the warning marker and credits", async () => {
      const id = await number({ marker: 1 });
      await credits(100);
      await rejectWrites("transaction_history", async () => {
        expect(await sweep("2026-05-01")).toMatchObject({
          charged: 0,
          warned: 0,
          technicalFailures: 1,
        });
        expect(await state(id)).toMatchObject({ marker: 1 });
        expect(await ledger()).toHaveLength(0);
        const [row] =
          await sql`select credits from public.workspace where id = ${workspace}::uuid`;
        expect(Number(row.credits)).toBe(100);
      });
    });

    test("reset is confined to the billed workspace", async () => {
      const id = await number({ marker: 1 });
      const before = await state(foreignNumber);
      await credits(100);
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 1,
        warned: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null });
      expect(await state(foreignNumber)).toEqual(before);
      expect(
        await sql`select id from public.transaction_history where workspace = ${foreign}::uuid`,
      ).toHaveLength(0);
    });

    test("a disabled workspace with all cycles already paid can clear its retained marker", async () => {
      const id = await number();
      await credits(200);
      expect(await sweep("2026-05-01")).toMatchObject({ charged: 1 });
      await sql`update public.workspace_number set rental_warned_cycle = 1 where id = ${id}`;
      await sql`update public.workspace set disabled = true where id = ${workspace}::uuid`;
      const before = await ledger();
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 0,
        warned: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null });
      expect(await ledger()).toEqual(before);
    });

    test("a reset write failure is reported and the paid retry clears it without double debit", async () => {
      const id = await number({ marker: 1 });
      await credits(100);
      await rejectWrites("workspace_number", async () => {
        expect(await sweep("2026-05-01")).toMatchObject({
          charged: 1,
          technicalFailures: 1,
          warned: 0,
        });
        expect(await state(id)).toMatchObject({ marker: 1 });
        expect(await ledger()).toHaveLength(1);
      });
      expect(await sweep("2026-05-01")).toMatchObject({
        charged: 0,
        technicalFailures: 0,
        warned: 0,
      });
      expect(await state(id)).toMatchObject({ marker: null });
      expect((await ledger()).map((row) => Number(row.amount))).toEqual([-100]);
    });

    test("runtime pools use the selected fixture database", async () => {
      const { pool, directPool } = await import("@/server/db");
      const [fixtureDb] = await sql`select current_database() as name`;
      expect((await pool`select current_database() as name`)[0].name).toBe(
        fixtureDb.name,
      );
      expect(
        (await directPool`select current_database() as name`)[0].name,
      ).toBe(fixtureDb.name);
    });
  },
);
