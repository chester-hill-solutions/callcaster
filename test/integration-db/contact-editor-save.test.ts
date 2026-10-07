import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
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

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID(),
  foreign = randomUUID();
const identities = new Map<
  string,
  { id: string; cookie: string; email: string }
>();
const ownedEmails: string[] = [],
  closePools: (() => Promise<unknown>)[] = [];
let sql: ReturnType<typeof postgres>;
let middleware: typeof import("@/lib/workspace-middleware.server").workspaceMiddleware;
let action: typeof import("@/routes/workspaces+/$id/contacts/$contactId.action.server").action;
let loader: typeof import("@/routes/workspaces+/$id/contacts/$contactId.loader.server").loader;
let contactId: number,
  foreignContactId: number,
  listId: number,
  hiddenId: number,
  addedId: number,
  foreignListId: number;
const initialOther = [
  { notes: "VIP", hidden: { enabled: true } },
  { score: 7 },
  null,
];
function identity(actor: string) {
  const value = identities.get(actor);
  if (!value) throw new Error("Owned contact identity missing");
  return value;
}
async function removeOwnedFailure(trigger: string, fn: string) {
  const failures: unknown[] = [];
  try {
    await sql.unsafe(`drop trigger if exists ${trigger} on contact_audience`);
  } catch (error) {
    failures.push(error);
  }
  try {
    await sql.unsafe(`drop function if exists ${fn}()`);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length)
    throw new AggregateError(failures, "Owned contact failure cleanup failed");
}
async function clean() {
  await sql`delete from contact_audience where contact_id in (select id from contact where workspace in (${workspace},${foreign}))`;
  await sql`delete from contact where workspace in (${workspace},${foreign})`;
  await sql`delete from audience where workspace in (${workspace},${foreign})`;
  await sql`delete from workspace_member where workspace_id in (${workspace},${foreign})`;
  await sql`delete from workspace where id in (${workspace},${foreign})`;
}
async function stored(id = contactId) {
  const [row] =
    await sql`select firstname, phone, other_data from contact where id=${id}`;
  const links =
    await sql`select audience_id from contact_audience where contact_id=${id} order by audience_id`;
  return { ...row, audienceIds: links.map((row) => Number(row.audience_id)) };
}
function fields(overrides: Record<string, string> = {}) {
  return {
    firstname: "Changed",
    phone: "(416) 555-0123",
    audience_ids: JSON.stringify([hiddenId, addedId]),
    other_data: JSON.stringify([
      { notes: "Updated", hidden: { enabled: true } },
      { score: 7 },
      null,
    ]),
    ...overrides,
  };
}
async function save(
  values = fields(),
  options: { actor?: string; id?: number | "new" } = {},
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  const cookie = identities.get(options.actor ?? "member")?.cookie;
  const request = new Request(
    `http://127.0.0.1:3038/workspaces/${workspace}/contacts/${options.id ?? contactId}`,
    {
      method: "POST",
      headers: cookie ? { Cookie: cookie } : {},
      body,
    },
  );
  const args = {
    request,
    url: new URL(request.url),
    params: { id: workspace, contactId: String(options.id ?? contactId) },
    context: new RouterContextProvider(),
  };
  return asRouteResponse(middleware(args, async () => action(args)));
}
async function load(id = contactId) {
  const request = new Request(
    `http://127.0.0.1:3038/workspaces/${workspace}/contacts/${id}`,
    {
      headers: { Cookie: identity("member").cookie },
    },
  );
  const args = {
    request,
    url: new URL(request.url),
    params: { id: workspace, contactId: String(id) },
    context: new RouterContextProvider(),
  };
  return asRouteResponse(middleware(args, async () => loader(args)));
}

describe.skipIf(!databaseUrl)(
  "complete contact editor saves with real sessions and PostgreSQL (#2127)",
  () => {
    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Database required");
      for (const [name, value] of Object.entries({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: databaseUrl,
        BASE_URL: "http://127.0.0.1:3038",
        BETTER_AUTH_URL: "http://127.0.0.1:3038/api/auth",
        BETTER_AUTH_SECRET: "owned-contact-editor-2127-fixture-secret",
        TZ: "UTC",
      }))
        vi.stubEnv(name, value);
      sql = postgres(databaseUrl, { max: 2 });
      closePools.push(() => sql.end());
      const { pool, directPool } = await import("@/server/db");
      closePools.push(
        () => pool.end(),
        () => directPool.end(),
      );
      const { auth } = await import("@/server/auth-instance");
      const context = await auth.$context;
      for (const actor of ["member", "caller", "outsider"]) {
        const email = `owned-2127-${actor}-${randomUUID()}@example.test`;
        ownedEmails.push(email);
        const result = await auth.api.signUpEmail({
          body: {
            name: `Owned ${actor}`,
            email,
            password: "OwnedContact2127Password!",
          },
          headers: new Headers({ Origin: "http://127.0.0.1:3038" }),
          returnHeaders: true,
        });
        const cookie = result.headers
          .getSetCookie()
          .find((value) =>
            value.startsWith(context.authCookies.sessionToken.name + "="),
          );
        if (!cookie) throw new Error("Real session cookie missing");
        identities.set(actor, {
          id: result.response.user.id,
          email,
          cookie: cookie.split(";")[0],
        });
      }
      ({ workspaceMiddleware: middleware } =
        await import("@/lib/workspace-middleware.server"));
      ({ action } =
        await import("@/routes/workspaces+/$id/contacts/$contactId.action.server"));
      ({ loader } =
        await import("@/routes/workspaces+/$id/contacts/$contactId.loader.server"));
    });
    beforeEach(async () => {
      await clean();
      await sql`insert into workspace (id,name) values (${workspace},'Owned contact editor'),(${foreign},'Owned foreign editor')`;
      for (const actor of ["member", "caller"])
        await sql`insert into workspace_member (id,workspace_id,user_id,role_id)
      values (${randomUUID()},${workspace},${identity(actor).id},${actor})`;
      const contacts =
        await sql`insert into contact (workspace,firstname,phone,other_data)
      values (${workspace},'Original','+14165550123',${sql.json(initialOther)}),(${foreign},'Foreign','+14165550124','[]'::jsonb) returning id`;
      [contactId, foreignContactId] = contacts.map((row) => Number(row.id));
      const lists =
        await sql`insert into audience (workspace,name) values (${workspace},'Visible'),(${workspace},'Hidden'),
      (${workspace},'Added'),(${foreign},'Foreign') returning id`;
      [listId, hiddenId, addedId, foreignListId] = lists.map((row) =>
        Number(row.id),
      );
      await sql`insert into contact_audience (contact_id,audience_id) values (${contactId},${listId}),(${contactId},${hiddenId})`;
    });
    afterAll(async () => {
      try {
        const failures: unknown[] = [];
        try {
          if (sql) {
            await clean();
            for (const email of ownedEmails) {
              await sql`delete from "user" where username=${email}`;
              await sql`delete from auth_user where email=${email}`;
            }
          }
        } catch (error) {
          failures.push(error);
        }
        for (const result of await Promise.allSettled(
          closePools.map(async (close) => close()),
        ))
          if (result.status === "rejected") failures.push(result.reason);
        if (failures.length)
          throw new AggregateError(
            failures,
            "Owned contact fixture cleanup failed",
          );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    test("text, call-list edits and typed Other Data survive the actual loader round trip", async () => {
      expect((await save()).status).toBe(200);
      expect(await stored()).toEqual({
        firstname: "Changed",
        phone: "+14165550123",
        other_data: [
          { notes: "Updated", hidden: { enabled: true } },
          { score: 7 },
          null,
        ],
        audienceIds: [hiddenId, addedId].sort((a, b) => a - b),
      });
      const result = await load();
      expect(result.status).toBe(200);
      const data = await result.json();
      expect(data.contact.other_data).toEqual([
        { notes: "Updated", hidden: { enabled: true } },
        { score: 7 },
        null,
      ]);
      expect(
        data.contact.contact_audience
          .map((row: { audience_id: number }) => Number(row.audience_id))
          .sort((a: number, b: number) => a - b),
      ).toEqual([hiddenId, addedId].sort((a, b) => a - b));
    });
    test("removing one displayed Other Data key preserves its siblings after save and reload", async () => {
      const other = [{ hidden: { enabled: true } }, { score: 7 }, null];
      expect(
        (await save(fields({ other_data: JSON.stringify(other) }))).status,
      ).toBe(200);
      expect((await stored()).other_data).toEqual(other);
      expect((await (await load()).json()).contact.other_data).toEqual(other);
    });
    test("empty arrays intentionally clear memberships and Other Data", async () => {
      expect(
        (await save(fields({ audience_ids: "[]", other_data: "[]" }))).status,
      ).toBe(200);
      expect(await stored()).toMatchObject({
        firstname: "Changed",
        audienceIds: [],
        other_data: [],
      });
    });
    test("duplicate submitted list IDs create one membership", async () => {
      expect(
        (
          await save(
            fields({ audience_ids: JSON.stringify([addedId, addedId]) }),
          )
        ).status,
      ).toBe(200);
      expect((await stored()).audienceIds).toEqual([addedId]);
    });
    test("a text-only legacy submission preserves lists and typed JSON", async () => {
      expect(
        (await save({ firstname: "Text control", phone: "(416) 555-0123" }))
          .status,
      ).toBe(200);
      expect(await stored()).toEqual({
        firstname: "Text control",
        phone: "+14165550123",
        other_data: initialOther,
        audienceIds: [listId, hiddenId].sort((a, b) => a - b),
      });
    });
    test("new contact Save stores all three parts and retains duplicate-phone warning", async () => {
      const result = await save(fields(), { id: "new" });
      expect(result.status).toBe(200);
      const data = await result.json();
      expect(data.warning).toContain("already exists");
      const id = Number(data.contact.id);
      expect(id).not.toBe(contactId);
      expect(await stored(id)).toMatchObject({
        firstname: "Changed",
        phone: "+14165550123",
        audienceIds: [hiddenId, addedId].sort((a, b) => a - b),
        other_data: [
          { notes: "Updated", hidden: { enabled: true } },
          { score: 7 },
          null,
        ],
      });
    });
    test.each(["caller", "outsider", "no-session"])(
      "%s cannot change the contact",
      async (actor) => {
        const before = await stored();
        const result = await save(fields(), { actor });
        expect(result.status).toBe(actor === "caller" ? 403 : 302);
        expect(await stored()).toEqual(before);
      },
    );
    test.each(["broken", "null", "{}", '["1"]', "[0]", "[-1]", "[1.5]"])(
      "invalid list IDs %s are refused before any write",
      async (audience_ids) => {
        const before = await stored();
        expect((await save(fields({ audience_ids }))).status).toBe(400);
        expect(await stored()).toEqual(before);
      },
    );
    test.each(["broken", "null", "{}", '"text"'])(
      "invalid Other Data %s is refused before any write",
      async (other_data) => {
        const before = await stored();
        expect((await save(fields({ other_data }))).status).toBe(400);
        expect(await stored()).toEqual(before);
      },
    );
    test("a foreign contact cannot be edited through this workspace", async () => {
      const before = await stored(foreignContactId);
      expect((await save(fields(), { id: foreignContactId })).status).toBe(404);
      expect(await stored(foreignContactId)).toEqual(before);
    });
    test.each(["foreign", "missing"])(
      "a %s call list rejects the whole contact Save",
      async (kind) => {
        const before = await stored();
        const id = kind === "foreign" ? foreignListId : 9007199254740990;
        expect(
          (await save(fields({ audience_ids: JSON.stringify([addedId, id]) })))
            .status,
        ).toBe(404);
        expect(await stored()).toEqual(before);
      },
    );
    test("a list outside the loader's 200 choices remains a stored membership", async () => {
      await sql`update audience set created_at = '2000-01-01' where id=${hiddenId}`;
      await sql`insert into audience (workspace,name) select ${workspace},'Owned overflow ' || n from generate_series(1,201) n`;
      const data = await (await load()).json();
      expect(data.audiences).toHaveLength(200);
      expect(
        data.audiences.some(
          (row: { id: number }) => Number(row.id) === hiddenId,
        ),
      ).toBe(false);
      expect(
        data.contact.contact_audience.some(
          (row: { audience_id: number }) =>
            Number(row.audience_id) === hiddenId,
        ),
      ).toBe(true);
      expect((await save()).status).toBe(200);
      expect((await stored()).audienceIds).toEqual(
        [hiddenId, addedId].sort((a, b) => a - b),
      );
    });
    test("a new contact with a foreign list is refused without creating a contact", async () => {
      const before =
        await sql`select id from contact where workspace=${workspace}`;
      expect(
        (
          await save(
            fields({ audience_ids: JSON.stringify([foreignListId]) }),
            { id: "new" },
          )
        ).status,
      ).toBe(404);
      expect(
        await sql`select id from contact where workspace=${workspace}`,
      ).toEqual(before);
    });
    test("a failed new-contact membership write rolls back the new contact", async () => {
      const suffix = randomUUID().replaceAll("-", ""),
        trigger = `owned_2127_${suffix}`,
        fn = `owned_2127_fail_${suffix}`;
      const before =
        await sql`select id from contact where workspace=${workspace}`;
      try {
        await sql.unsafe(
          `create function ${fn}() returns trigger language plpgsql as $$ begin if exists(select 1 from contact where id = new.contact_id and workspace = '${workspace}'::uuid) then raise exception 'Owned new contact failure'; end if; return new; end $$`,
        );
        await sql.unsafe(
          `create trigger ${trigger} before insert on contact_audience for each row execute function ${fn}()`,
        );
        expect((await save(fields(), { id: "new" })).status).toBe(500);
        expect(
          await sql`select id from contact where workspace=${workspace}`,
        ).toEqual(before);
      } finally {
        await removeOwnedFailure(trigger, fn);
      }
    });
    test("a failed membership write rolls back text and Other Data", async () => {
      const suffix = randomUUID().replaceAll("-", ""),
        trigger = `owned_2127_${suffix}`,
        fn = `owned_2127_fail_${suffix}`;
      const before = await stored();
      try {
        await sql.unsafe(
          `create function ${fn}() returns trigger language plpgsql as $$ begin if new.contact_id = ${contactId} then raise exception 'Owned contact failure'; end if; return new; end $$`,
        );
        await sql.unsafe(
          `create trigger ${trigger} before insert on contact_audience for each row execute function ${fn}()`,
        );
        expect((await save()).status).toBe(500);
        expect(await stored()).toEqual(before);
      } finally {
        await removeOwnedFailure(trigger, fn);
      }
    });
  },
);
