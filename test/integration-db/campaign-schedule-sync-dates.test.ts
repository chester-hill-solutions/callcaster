import { randomUUID } from "node:crypto";
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

const fixture = vi.hoisted(() => {
  const previous = Object.fromEntries(
    ["DATABASE_URL", "DATABASE_DIRECT_URL", "TZ"].map((key) => [
      key,
      process.env[key],
    ]),
  );
  const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_DIRECT_URL = url;
    process.env.TZ = "UTC";
  }
  return { url, previous, now: new Date("2026-08-12T15:00:00Z") };
});
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitCampaignStatusEvent: vi.fn(async () => undefined),
}));
const describeDb = fixture.url ? describe : describe.skip;
const open = {
  wednesday: { active: true, intervals: [{ start: "09:00", end: "21:00" }] },
};
const closed = {
  wednesday: { active: true, intervals: [{ start: "16:00", end: "21:00" }] },
};
const start = "2026-08-01T00:00:00Z";
const end = "2026-08-31T00:00:00Z";
const rows = [
  {
    name: "no dates outside hours",
    start: null,
    end: null,
    schedule: closed,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "no dates inside hours",
    start: null,
    end: null,
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "start only outside hours",
    start,
    end: null,
    schedule: closed,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "start only inside hours",
    start,
    end: null,
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "end only outside hours",
    start: null,
    end,
    schedule: closed,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "end only inside hours",
    start: null,
    end,
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "valid range outside hours",
    start,
    end,
    schedule: closed,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "valid range inside hours",
    start,
    end,
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "future start with no end",
    start: "2026-08-13T00:00:00Z",
    end: null,
    schedule: open,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "future start with end",
    start: "2026-08-13T00:00:00Z",
    end,
    schedule: open,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "exact start bound",
    start: "2026-08-12T15:00:00Z",
    end: null,
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "exact end bound",
    start: null,
    end: "2026-08-12T15:00:00Z",
    schedule: open,
    initial: "waiting",
    expected: "running",
    allowed: true,
  },
  {
    name: "expired range stays worker owned",
    start,
    end: "2026-08-11T00:00:00Z",
    schedule: closed,
    initial: "running",
    expected: "running",
    allowed: false,
  },
  {
    name: "expired end only stays worker owned",
    start: null,
    end: "2026-08-11T00:00:00Z",
    schedule: closed,
    initial: "running",
    expected: "running",
    allowed: false,
  },
  {
    name: "missing calling hours never dials",
    start: null,
    end: null,
    schedule: null,
    initial: "running",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "already waiting outside hours",
    start: null,
    end: null,
    schedule: closed,
    initial: "waiting",
    expected: "waiting",
    allowed: false,
  },
  {
    name: "already running inside hours",
    start: null,
    end: null,
    schedule: open,
    initial: "running",
    expected: "running",
    allowed: true,
  },
];

describeDb(
  "schedule sweep optional dates through real Postgres (#2119)",
  () => {
    const workspace = randomUUID();
    const sibling = randomUUID();
    let sql: postgres.Sql;
    let run: typeof import("@/lib/campaign-schedule-sync.server").runCampaignScheduleSync;
    let checkSchedule: typeof import("@/lib/database/campaign.server").checkSchedule;
    let adminDb: typeof import("@/server/admin-db").adminDb;
    let emit: typeof import("@/lib/workspace-events.server").emitCampaignStatusEvent;
    const ids: number[] = [];

    async function clearCampaigns() {
      if (ids.length)
        await sql`delete from campaign where id = any(${ids}::bigint[])`;
      ids.length = 0;
    }
    async function campaign(
      values: {
        start?: string | null;
        end?: string | null;
        schedule?: typeof open | null;
        initial?: string;
        type?: string | null;
        workspaceId?: string | null;
      } = {},
    ) {
      const [row] =
        await sql`insert into campaign (workspace, type, status, start_date, end_date, schedule, title)
      values (${values.workspaceId === undefined ? workspace : values.workspaceId}::uuid,
        ${values.type === undefined ? "robocall" : values.type}, ${values.initial ?? "running"},
        ${values.start ?? null}, ${values.end ?? null}, ${sql.json(values.schedule === undefined ? closed : values.schedule)}, 'Schedule fixture') returning id`;
      const id = Number(row.id);
      ids.push(id);
      return id;
    }
    async function status(id: number) {
      const [row] = await sql`select status from campaign where id = ${id}`;
      return row.status;
    }

    beforeAll(async () => {
      if (!fixture.url) throw new Error("A database URL is required");
      sql = postgres(fixture.url, { max: 2 });
      await sql`insert into workspace (id, name, credits) values
      (${workspace}::uuid, 'Schedule fixture', 0), (${sibling}::uuid, 'Sibling schedule fixture', 0)`;
      ({ runCampaignScheduleSync: run } =
        await import("@/lib/campaign-schedule-sync.server"));
      ({ checkSchedule } = await import("@/lib/database/campaign.server"));
      ({ adminDb } = await import("@/server/admin-db"));
      ({ emitCampaignStatusEvent: emit } =
        await import("@/lib/workspace-events.server"));
    });
    beforeEach(async () => {
      await clearCampaigns();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(fixture.now);
    });
    afterEach(() => vi.useRealTimers());
    afterAll(async () => {
      try {
        if (sql) {
          await clearCampaigns();
          await sql`delete from workspace where id in (${workspace}::uuid, ${sibling}::uuid)`;
        }
        if (adminDb) {
          const db = await import("@/server/db");
          await Promise.all([db.pool.end(), db.directPool.end()]);
        }
      } finally {
        if (sql) await sql.end();
        for (const [key, value] of Object.entries(fixture.previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    test.each(rows)("$name", async (values) => {
      const id = await campaign(values);
      expect(
        checkSchedule({
          start_date: values.start,
          end_date: values.end,
          schedule: values.schedule,
        }),
      ).toBe(values.allowed);
      await run();
      expect(await status(id)).toBe(values.expected);
    });

    test.each([
      {
        name: "message",
        type: "message",
        initial: "running",
        workspaceId: undefined,
      },
      {
        name: "missing type",
        type: null,
        initial: "running",
        workspaceId: undefined,
      },
      {
        name: "paused",
        type: "robocall",
        initial: "paused",
        workspaceId: undefined,
      },
      {
        name: "complete",
        type: "robocall",
        initial: "complete",
        workspaceId: undefined,
      },
      {
        name: "draft",
        type: "robocall",
        initial: "draft",
        workspaceId: undefined,
      },
      {
        name: "scheduled",
        type: "robocall",
        initial: "scheduled",
        workspaceId: undefined,
      },
      {
        name: "missing workspace",
        type: "robocall",
        initial: "running",
        workspaceId: null,
      },
    ])("excludes $name independently", async (values) => {
      const id = await campaign(values);
      await run();
      expect(await status(id)).toBe(values.initial);
      expect(emit).not.toHaveBeenCalled();
    });

    test("updates the right campaign in each workspace", async () => {
      const first = await campaign();
      const second = await campaign({
        workspaceId: sibling,
        initial: "waiting",
        schedule: open,
      });
      await run();
      expect(await status(first)).toBe("waiting");
      expect(await status(second)).toBe("running");
      expect(emit).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({ id: first, status: "waiting" }),
        expect.objectContaining({ status: "running" }),
      );
      expect(emit).toHaveBeenCalledWith(
        sibling,
        expect.objectContaining({ id: second, status: "running" }),
        expect.objectContaining({ status: "waiting" }),
      );
    });

    test.each(["paused", "complete"])(
      "preserves a concurrent %s during the actual sweep",
      async (newerStatus) => {
        const id = await campaign();
        const actual = adminDb.query.campaign.findMany.bind(
          adminDb.query.campaign,
        );
        vi.spyOn(adminDb.query.campaign, "findMany").mockImplementationOnce(
          async (options) => {
            const candidates = await actual(options);
            expect(
              candidates.some(
                (candidate) =>
                  candidate.id === id && candidate.status === "running",
              ),
            ).toBe(true);
            await sql`update campaign set status = ${newerStatus} where id = ${id}`;
            return candidates;
          },
        );
        await run();
        expect(await status(id)).toBe(newerStatus);
        expect(emit).not.toHaveBeenCalled();
      },
    );
  },
);
