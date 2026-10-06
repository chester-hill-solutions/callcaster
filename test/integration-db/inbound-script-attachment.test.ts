import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();
const actorId = randomUUID();

// Session identity is a fixture; membership, handlers, validation and writes use the real database.
vi.mock("@/lib/api-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth.server")>()),
  requireDualAuth: async () => ({ authType: "session", user: { id: actorId } }),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: async () => ({ headers: new Headers() }),
}));

function steps(next = "end") {
  return {
    startPageId: "page_1", pageOrder: ["page_1"],
    pages: { page_1: { id: "page_1", title: "Menu", blocks: ["block_1"] } },
    blocks: { block_1: { id: "block_1", type: "synthetic", audioFile: "Choose",
      options: [{ value: "1", label: "Continue", next }] } },
  };
}

suite("inbound script attachment and overwrite boundaries (#2269)", () => {
  let client: postgres.Sql;
  let persistence: typeof import("@/lib/script-persistence.server");

  async function cleanup() {
    for (const id of [workspaceId, foreignWorkspaceId]) {
      await client`delete from workspace_number where workspace = ${id}`;
      await client`delete from campaign where workspace = ${id}`;
      await client`delete from script where workspace = ${id}`;
      await client`delete from inbound_queue where workspace_id = ${id}`;
      await client`delete from workspace_member where workspace_id = ${id}`;
      await client`delete from workspace where id = ${id}`;
    }
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Inbound validation cases require a database");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 4 });
    await client`insert into "user" (id, username) values (${actorId}, ${`ivr-${actorId}`})`;
    persistence = await import("@/lib/script-persistence.server");
  });
  beforeEach(async () => {
    await cleanup();
    await client`insert into workspace (id, name, credits) values
      (${workspaceId}, 'Inbound validation', 100), (${foreignWorkspaceId}, 'Foreign menu', 100)`;
    await client`insert into workspace_member (id, workspace_id, user_id, role_id)
      values (${`ivr:${workspaceId}:${actorId}`}, ${workspaceId}, ${actorId}, 'admin')`;
  });
  afterAll(async () => {
    try {
      if (client) {
        await cleanup();
        await client`delete from "user" where id = ${actorId}`;
      }
    } finally {
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
      vi.unstubAllEnvs();
    }
  });

  async function script(options: { owner?: string; type?: string; content?: ReturnType<typeof steps> } = {}) {
    const [row] = await client`insert into script (workspace, name, type, steps)
      values (${options.owner ?? workspaceId}, ${randomUUID()}, ${options.type ?? 'inbound_ivr'},
      ${client.json(options.content ?? steps())}) returning id`;
    return Number(row.id);
  }
  async function number(scriptId: number | null = null) {
    const [row] = await client`insert into workspace_number (workspace, type, phone_number, inbound_script_id)
      values (${workspaceId}, 'local', '+15555550123', ${scriptId}) returning id`;
    return Number(row.id);
  }
  async function storedNumber(id: number) {
    const [row] = await client`select inbound_script_id from workspace_number
      where workspace = ${workspaceId} and id = ${id}`;
    return row.inbound_script_id == null ? null : Number(row.inbound_script_id);
  }

  async function attach(boundary: "api" | "form" | "preset", numberId: number, scriptId: number | null) {
    if (boundary === "api") {
      const { withDataPlaneRouteArgs } = await import("../helpers/route-context-mock");
      const { action } = await import("../../app/routes/api+/workspaces+/$workspaceId/numbers/$numberId.action.server");
      const request = new Request(`http://localhost/api/workspaces/${workspaceId}/numbers/${numberId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inbound_script_id: scriptId }),
      });
      return asRouteResponse(action(await withDataPlaneRouteArgs({ request,
        params: { workspaceId, numberId: String(numberId) } }, { userId: actorId, workspaceId })));
    }
    const { withWorkspaceRouteArgs } = await import("../helpers/route-context-mock");
    const { action } = await import("../../app/routes/workspaces+/$id/phone-numbers.action.server");
    const request = new Request(`http://localhost/workspaces/${workspaceId}/phone-numbers`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boundary === "preset"
        ? { formName: "apply-routing-preset", presetId: "automated_menu", scriptId, numberId }
        : { formName: "update-inbound-script", inboundScriptId: scriptId, numberId }),
    });
    return asRouteResponse(action(await withWorkspaceRouteArgs({ request, params: { id: workspaceId } },
      { userId: actorId, workspaceId, userRole: "admin" })));
  }

  for (const boundary of ["api", "form", "preset"] as const) {
    test.each(["foreign", "wrong-type", "dangling", "missing", "bad-forward", "bad-email", "foreign-queue", "missing-queue", "raw-block"] as const)(
      `${boundary} rejects %s before replacing the last valid attachment`, async (fault) => {
        const previous = await script();
        const id = await number(previous);
        let content = steps();
        if (fault === "dangling") content = steps("page_missing:block_missing");
        if (fault === "bad-forward") content = steps("forward:+0123");
        if (fault === "bad-email") content = steps("voicemail:a..b@example.test");
        if (fault === "missing-queue") content = steps("queue:900000000");
        if (fault === "foreign-queue") {
          const [queue] = await client`insert into inbound_queue (workspace_id, name)
            values (${foreignWorkspaceId}, 'Foreign queue') returning id`;
          content = steps(`queue:${queue.id}`);
        }
        if (fault === "raw-block") content.pages.page_1.blocks = ["missing"];
        const selected = fault === "missing" ? 900_000_000 : await script({
          ...(fault === "foreign" ? { owner: foreignWorkspaceId } : {}),
          ...(fault === "wrong-type" ? { type: "script" } : {}),
          content,
        });
        const response = await attach(boundary, id, selected);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: expect.any(String) });
        expect(await storedNumber(id)).toBe(previous);
      },
    );
    test.each(["end", "hangup", "forward:+15555550123", "voicemail:fixture@example.test", "queue"])(
      `${boundary} attaches supported %s routing`, async (target) => {
        if (target === "queue") {
          const [queue] = await client`insert into inbound_queue (workspace_id, name)
            values (${workspaceId}, 'Owned queue') returning id`;
          target = `queue:${queue.id}`;
        }
        const selected = await script({ content: steps(target) }); const id = await number();
        const response = await attach(boundary, id, selected);
        expect(response.status).toBe(200);
        expect(await storedNumber(id)).toBe(selected);
      },
    );
  }
  for (const boundary of ["api", "form", "preset"] as const) {
    test.each(["audio", "instruction", "textblock", "infotext"])(
      `${boundary} checks targets on raw %s blocks before migration can drop them`, async (wireType) => {
        const previous = await script(); const id = await number(previous);
        for (const target of ["page_missing:block_missing", "forward:+0123", "voicemail:a..b@example.test"]) {
          const content = steps(target); content.blocks.block_1.type = wireType;
          const selected = await script({ content });
          expect((await attach(boundary, id, selected)).status).toBe(400);
          expect(await storedNumber(id)).toBe(previous);
        }
        const [queue] = await client`insert into inbound_queue (workspace_id, name)
          values (${foreignWorkspaceId}, 'Foreign raw queue') returning id`;
        const content = steps(`queue:${queue.id}`); content.blocks.block_1.type = wireType;
        const selected = await script({ content });
        expect((await attach(boundary, id, selected)).status).toBe(400);
        expect(await storedNumber(id)).toBe(previous);
      },
    );
    test.each(["audio", "instruction", "textblock", "infotext"])(
      `${boundary} retains a valid target on raw %s blocks`, async (wireType) => {
        const content = steps("forward:+15555550123"); content.blocks.block_1.type = wireType;
        const selected = await script({ content }); const id = await number();
        expect((await attach(boundary, id, selected)).status).toBe(200);
        expect(await storedNumber(id)).toBe(selected);
      },
    );
  }

  test.each(["api", "form"] as const)("%s can clear an attachment", async (boundary) => {
    const selected = await script(); const id = await number(selected);
    expect((await attach(boundary, id, null)).status).toBe(200);
    expect(await storedNumber(id)).toBeNull();
  });

  test.each(["workspace", "campaign"] as const)(
    "%s rejects an invalid overwrite and preserves stored script and campaign", async (boundary) => {
      const selected = await script(); await number(selected);
      const [campaign] = await client`insert into campaign (workspace, type, title, script_id)
        values (${workspaceId}, 'simple_ivr', 'Original campaign', ${selected}) returning id`;
      const content = { name: "Invalid replacement", steps: steps("page_missing:block_missing"), type: "inbound_ivr" };
      const write = () => boundary === "workspace"
        ? persistence.persistWorkspaceScript({ workspaceId, actorId, mode: "update", scriptId: selected, content })
        : persistence.persistCampaignScript({ workspaceId, actorId, campaignId: Number(campaign.id),
            scriptId: selected, content, saveAsCopy: false });
      await expect(write()).rejects.toMatchObject({ statusCode: 400 });
      const [stored] = await client`select name, steps from script where id = ${selected} and workspace = ${workspaceId}`;
      expect(stored.name).not.toBe("Invalid replacement");
      expect(stored.steps).toEqual(steps());
      const [linked] = await client`select script_id, title from campaign where id = ${campaign.id}`;
      expect(Number(linked.script_id)).toBe(selected);
      expect(linked.title).toBe("Original campaign");
    },
  );
  test("an unattached invalid menu can remain a draft", async () => {
    const selected = await script();
    const saved = await persistence.persistWorkspaceScript({ workspaceId, actorId, mode: "update",
      scriptId: selected, content: { name: "Draft", steps: steps("missing"), type: "inbound_ivr" } });
    expect(saved?.name).toBe("Draft");
    const [stored] = await client`select steps from script where id = ${selected} and workspace = ${workspaceId}`;
    expect(stored.steps).toEqual(steps("missing"));
  });
  async function saveApi(boundary: "workspace" | "campaign", selected: number, campaignId: number, next: string, copy = false) {
    const payload = boundary === "workspace"
      ? { id: selected, workspace: workspaceId, name: "Replacement", steps: steps(next), saveAsCopy: copy }
      : { campaignData: JSON.stringify({ id: campaignId, campaign_id: campaignId, title: "Replacement campaign" }),
          campaignDetails: JSON.stringify({ campaign_id: campaignId }),
          scriptData: JSON.stringify({ id: selected, name: "Replacement", type: "inbound_ivr", steps: steps(next) }),
          saveScriptAsCopy: copy };
    const request = new Request(`http://localhost/api/${boundary === "workspace" ? "scripts" : "campaigns"}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const { RouterContextProvider } = await import("react-router");
    const args = { request, params: {}, context: new RouterContextProvider() };
    if (boundary === "workspace") {
      const { action } = await import("../../app/routes/api+/scripts.action.server");
      return asRouteResponse(action(args));
    }
    const { action } = await import("../../app/routes/api+/campaigns.action.server");
    return asRouteResponse(action(args));
  }

  for (const boundary of ["workspace", "campaign"] as const) {
    test(`${boundary} API keeps the attached script and campaign after invalid save`, async () => {
      const selected = await script(); await number(selected);
      const [campaign] = await client`insert into campaign (workspace, type, title, script_id)
        values (${workspaceId}, 'simple_ivr', 'Original campaign', ${selected}) returning id`;
      const response = await saveApi(boundary, selected, Number(campaign.id), "page_missing:block_missing");
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("invalid routing") });
      const [stored] = await client`select steps from script where workspace = ${workspaceId} and id = ${selected}`;
      expect(stored.steps).toEqual(steps());
      const [linked] = await client`select title, script_id from campaign where workspace = ${workspaceId} and id = ${campaign.id}`;
      expect(linked.title).toBe("Original campaign");
      expect(Number(linked.script_id)).toBe(selected);
    });
    test(`${boundary} API updates valid attached content`, async () => {
      const selected = await script(); const id = await number(selected);
      const [campaign] = await client`insert into campaign (workspace, type, title, script_id)
        values (${workspaceId}, 'simple_ivr', 'Original campaign', ${selected}) returning id`;
      const response = await saveApi(boundary, selected, Number(campaign.id), "forward:+15555550123");
      expect(response.status).toBe(200);
      const [stored] = await client`select steps from script where workspace = ${workspaceId} and id = ${selected}`;
      expect(stored.steps).toEqual(steps("forward:+15555550123"));
      expect(await storedNumber(id)).toBe(selected);
    });
    test(`${boundary} API can save an invalid copy without replacing the attached menu`, async () => {
      const selected = await script(); const id = await number(selected);
      const [campaign] = await client`insert into campaign (workspace, type, title, script_id)
        values (${workspaceId}, 'simple_ivr', 'Original campaign', ${selected}) returning id`;
      const response = await saveApi(boundary, selected, Number(campaign.id), "missing", true);
      expect(response.status).toBe(200);
      const [original] = await client`select steps from script where workspace = ${workspaceId} and id = ${selected}`;
      expect(original.steps).toEqual(steps());
      expect(await storedNumber(id)).toBe(selected);
      const drafts = await client`select steps from script where workspace = ${workspaceId} and id <> ${selected}`;
      expect(drafts).toHaveLength(1);
      expect(drafts[0].steps).toEqual(steps("missing"));
    });
  }

  test.each(["api", "form", "preset"] as const)(
    "%s maps an actual UPDATE-time serialization failure to a retry response", async (boundary) => {
      const selected = await script(); const id = await number();
      const fixture = "cc2269_conflict_" + randomUUID().replaceAll("-", "");
      let functionCreated = false, triggerCreated = false;
      try {
        await client.unsafe(`create function ${fixture}() returns trigger language plpgsql as $$
          begin raise exception 'Owned serialization failure' using errcode = '40001'; end $$`);
        functionCreated = true;
        await client.unsafe(`create trigger ${fixture} before update on workspace_number for each row
          when (new.workspace = '${workspaceId}'::uuid) execute function ${fixture}()`);
        triggerCreated = true;
        const response = await attach(boundary, id, selected);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: "The menu changed during this save. Review it and try again." });
        expect(await storedNumber(id)).toBeNull();
      } finally {
        if (triggerCreated) await client.unsafe(`drop trigger ${fixture} on workspace_number`);
        if (functionCreated) await client.unsafe(`drop function ${fixture}()`);
      }
    },
  );

  async function waitForBlockedWriters(count: number, blockerPid: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await client`select count(*)::int as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and query like '%script%' and query like '%for update%'
          and (${blockerPid} = any(pg_blocking_pids(pid)) or exists (
            select 1 from unnest(pg_blocking_pids(pid)) as blocked(pid)
              where ${blockerPid} = any(pg_blocking_pids(blocked.pid))))`;
      if (row.count >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} actual blocked menu writers`);
  }

  async function runBlockedWriters(selected: number, writers: Array<() => Promise<unknown>>,
    waitForWriters = waitForBlockedWriters) {
    let release!: () => void;
    let locked!: (pid: number) => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<number>((resolve) => { locked = resolve; });
    const blocker = client.begin(async (tx) => {
      await tx`select id from script where workspace = ${workspaceId} and id = ${selected} for update`;
      const [connection] = await tx`select pg_backend_pid() as pid`;
      locked(Number(connection.pid)); await gate;
    });
    const blockerPid = await ready;
    const calls: Array<Promise<{ value: unknown } | { error: unknown }>> = [];
    try {
      for (const writer of writers) {
        calls.push(writer().then((value) => ({ value }), (error) => ({ error })));
        await waitForWriters(calls.length, blockerPid);
      }
    } finally {
      release();
      try { await blocker; } finally { await Promise.all(calls); }
    }
    return Promise.all(calls);
  }

  test("a lock-wait failure drains a started product write before cleanup", async () => {
    const selected = await script(); let completed = false;
    let pending: Promise<unknown> | undefined;
    const write = () => pending = (async () => {
      try { return await persistence.persistWorkspaceScript({ workspaceId, actorId, mode: "update", scriptId: selected,
        content: { name: "Completed after release", type: "inbound_ivr", steps: steps() } }); }
      finally { completed = true; }
    })();
    try {
      await expect(runBlockedWriters(selected, [write], async (count, pid) => {
        await waitForBlockedWriters(count, pid);
        throw new Error("Owned lock-wait failure");
      })).rejects.toThrow("Owned lock-wait failure");
      expect(completed).toBe(true);
      const [stored] = await client`select name from script where workspace = ${workspaceId} and id = ${selected}`;
      expect(stored.name).toBe("Completed after release");
    } finally {
      await pending;
    }
  });

  for (const boundary of ["api", "form", "preset"] as const) {
    test.each(["save-first", "attach-first"] as const)(
      `${boundary} cannot race an attachment against an invalid overwrite (%s)`, async (order) => {
        const selected = await script(); const id = await number();
        const save = () => persistence.persistWorkspaceScript({ workspaceId, actorId, mode: "update", scriptId: selected,
          content: { name: "Invalid raced draft", steps: steps("missing"), type: "inbound_ivr" } });
        const attachment = () => attach(boundary, id, selected);
        const results = await runBlockedWriters(selected, order === "save-first" ? [save, attachment] : [attachment, save]);
        expect(results).toHaveLength(2);
        const [stored] = await client`select steps from script where workspace = ${workspaceId} and id = ${selected}`;
        const attached = await storedNumber(id);
        if (attached !== null) {
          expect(attached).toBe(selected);
          expect(stored.steps).toEqual(steps());
        } else {
          expect(stored.steps).toEqual(steps("missing"));
        }
        const attachmentIndex = order === "save-first" ? 1 : 0;
        const attachmentResult = results[attachmentIndex];
        if (!("value" in attachmentResult) || !attachmentResult.value ||
          typeof attachmentResult.value !== "object" || !("status" in attachmentResult.value) ||
          typeof attachmentResult.value.status !== "number" || !("json" in attachmentResult.value) ||
          typeof attachmentResult.value.json !== "function") {
          throw new Error("Attachment must return its actual route response");
        }
        expect([200, 400, 409]).toContain(attachmentResult.value.status);
        if (attachmentResult.value.status !== 200) {
          expect(await attachmentResult.value.json()).toMatchObject({ error: expect.any(String) });
        }
      },
    );
  }

});
