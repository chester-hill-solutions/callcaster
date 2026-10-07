import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const storage = vi.hoisted(() => ({ exists: vi.fn(), sign: vi.fn() }));
// Only object transport is simulated. Authentication, call/number/script queries
// and all three inbound actions use the production code and real PostgreSQL.
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  objectExists: (...args: unknown[]) => storage.exists(...args),
  createSignedObjectUrl: (...args: unknown[]) => storage.sign(...args),
}));

type Boundary = "page" | "block" | "response";
type Actor = "A" | "B";
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaces = { A: randomUUID(), B: randomUUID() };
const accounts = { A: "AC" + randomUUID().replaceAll("-", ""), B: "AC" + randomUUID().replaceAll("-", "") };
const tokens = { A: "owned-ivr-workspace-a", B: "owned-ivr-workspace-b" };
const callSid = "CA" + randomUUID().replaceAll("-", "");
const phone = "+14165552455";
const closePools: Array<() => Promise<void>> = [];
let sql: postgres.Sql;
let numbers: Record<Actor, number>, scripts: Record<Actor, number>;
let pageAction: typeof import("../../app/routes/api+/inbound-ivr/$numberId/$pageId.action.server").action;
let blockAction: typeof import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server").action;
let responseAction: typeof import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server").action;

async function cleanup() {
  await sql`delete from call where sid = ${callSid}`;
  await sql`delete from workspace_number where workspace in (${workspaces.A}, ${workspaces.B})`;
  await sql`delete from script where workspace in (${workspaces.A}, ${workspaces.B})`;
  await sql`delete from workspace where id in (${workspaces.A}, ${workspaces.B})`;
}

async function signedRequest(boundary: Boundary, options: {
  actor?: Actor; numberId?: number; token?: string; blockId?: string;
} = {}) {
  const actor = options.actor ?? "A", numberId = String(options.numberId ?? numbers.A);
  const blockId = options.blockId ?? "b1", pageId = "page_1";
  const suffix = boundary === "page" ? "" : `/${blockId}${boundary === "response" ? "/response" : ""}`;
  const url = `https://ivr-workspace.example/api/inbound-ivr/${numberId}/${pageId}${suffix}`;
  const values = { CallSid: callSid, AccountSid: accounts[actor], ...(boundary === "response" ? { Digits: "1" } : {}) };
  const request = new Request(url, { method: "POST", body: new URLSearchParams(values), headers: {
    "X-Twilio-Signature": getExpectedTwilioSignature(options.token ?? tokens[actor], url, values),
  } });
  const action = boundary === "page" ? pageAction : boundary === "block" ? blockAction : responseAction;
  return asRouteResponse(action({ request, url: new URL(url), params: { numberId, pageId, blockId }, context: new RouterContextProvider() }));
}

async function expectDenied(response: Response, status = 200) {
  expect(response.status).toBe(status);
  const xml = await response.text();
  expect(xml).toContain("<Hangup/>");
  expect(xml).not.toContain("<Redirect>");
  expect(xml).not.toContain("<Play>");
  expect(xml).not.toContain("<Gather");
  expect(storage.exists).not.toHaveBeenCalled();
  expect(storage.sign).not.toHaveBeenCalled();
}

describe.skipIf(!databaseUrl)("inbound IVR workspace authorization with real signed requests (#2455)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", "https://ivr-workspace.example");
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
    sql = postgres(databaseUrl, { max: 2 });
    closePools.push(async () => { await sql.end(); });
    const { pool, directPool } = await import("@/server/db");
    closePools.push(() => pool.end(), () => directPool.end());
    ({ action: pageAction } = await import("../../app/routes/api+/inbound-ivr/$numberId/$pageId.action.server"));
    ({ action: blockAction } = await import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server"));
    ({ action: responseAction } = await import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server"));
  });
  beforeEach(async () => {
    await cleanup();
    storage.exists.mockReset().mockResolvedValue(false);
    storage.sign.mockReset().mockImplementation(async (_bucket, key) => "https://objects.example/" + key);
    numbers = {} as Record<Actor, number>; scripts = {} as Record<Actor, number>;
    for (const actor of ["A", "B"] as const) {
      await sql`insert into workspace (id, name, twilio_data) values
        (${workspaces[actor]}, ${'Owned IVR workspace ' + actor}, ${sql.json({ sid: accounts[actor], authToken: tokens[actor] })})`;
      const steps = { pages: { page_1: { blocks: ["b1"] }, page_2: { blocks: ["b2"] } }, blocks: {
        b1: { id: "b1", type: "recorded", audioFile: "welcome.mp3", options: [{ value: "1", next: "page_2" }] },
        b2: { id: "b2", type: "synthetic", audioFile: "Owned continuation", options: [] },
      } };
      const [script] = await sql`insert into script (workspace, name, type, steps)
        values (${workspaces[actor]}, ${'Owned script ' + actor}, 'inbound_ivr', ${sql.json(steps)}) returning id`;
      scripts[actor] = Number(script.id);
      const [number] = await sql`insert into workspace_number (workspace, type, phone_number, inbound_script_id)
        values (${workspaces[actor]}, 'local', ${phone}, ${scripts[actor]}) returning id`;
      numbers[actor] = Number(number.id);
      const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
      invalidateWorkspaceTwilioData(workspaces[actor]);
    }
    await sql`insert into call (sid, workspace, "to", account_sid)
      values (${callSid}, ${workspaces.A}, ${phone}, ${accounts.A})`;
  });
  afterAll(async () => {
    try {
      const failures: unknown[] = [];
      try { if (sql) await cleanup(); } catch (error) { failures.push(error); }
      const results = await Promise.allSettled(closePools.map(async (close) => close()));
      for (const result of results) if (result.status === "rejected") failures.push(result.reason);
      if (failures.length) throw new AggregateError(failures, "Owned inbound workspace cleanup failed");
    } finally { vi.unstubAllEnvs(); }
  });

  describe.each(["page", "block", "response"] as const)("%s boundary", (boundary) => {
    test("a foreign signed call cannot use this number even with an identical called phone", async () => {
      await sql`update call set workspace = ${workspaces.B}, account_sid = ${accounts.B} where sid = ${callSid}`;
      await expectDenied(await signedRequest(boundary, { actor: "B" }));
    });

    test("a valid call cannot request the other workspace's number with the same phone", async () => {
      await expectDenied(await signedRequest(boundary, { numberId: numbers.B }));
    });

    test("a missing call workspace fails closed even when AccountSid validates the signature", async () => {
      await sql`update call set workspace = null where sid = ${callSid}`;
      await expectDenied(await signedRequest(boundary));
    });

    test("a missing call fails closed after account-based signature validation", async () => {
      await sql`delete from call where sid = ${callSid}`;
      await expectDenied(await signedRequest(boundary));
    });

    test("a missing number cannot redirect or sign audio", async () => {
      await expectDenied(await signedRequest(boundary, { numberId: -1 }));
    });

    test("a missing attached script cannot redirect or sign audio", async () => {
      await sql`update workspace_number set inbound_script_id = null where id = ${numbers.A} and workspace = ${workspaces.A}`;
      await expectDenied(await signedRequest(boundary));
    });

    test("an attached foreign script is refused by the actual tenant query", async () => {
      await sql`update workspace_number set inbound_script_id = ${scripts.B} where id = ${numbers.A} and workspace = ${workspaces.A}`;
      await expectDenied(await signedRequest(boundary));
    });

    test("a wrong signature stops before any prompt or redirect", async () => {
      await expectDenied(await signedRequest(boundary, { token: "invalid-owned-signature" }), 403);
    });

    test("a changed called phone cannot use the requested number", async () => {
      await sql`update call set "to" = '+14165552456' where sid = ${callSid}`;
      await expectDenied(await signedRequest(boundary));
    });

    test("a correct workspace call keeps its permitted routing and prompt", async () => {
      const response = await signedRequest(boundary);
      expect(response.status).toBe(200);
      const xml = await response.text();
      if (boundary === "page") {
        expect(xml).toContain(`<Redirect>/api/inbound-ivr/${numbers.A}/page_1/b1</Redirect>`);
        expect(storage.sign).not.toHaveBeenCalled();
      } else if (boundary === "block") {
        expect(xml).toContain(`<Gather action="https://ivr-workspace.example/api/inbound-ivr/${numbers.A}/page_1/b1/response"`);
        expect(xml).toContain(`<Play>https://objects.example/${workspaces.A}/welcome.mp3</Play></Gather>`);
      } else {
        expect(xml).toContain(`<Redirect>https://ivr-workspace.example/api/inbound-ivr/${numbers.A}/page_2/</Redirect>`);
        expect(storage.sign).not.toHaveBeenCalled();
      }
    });
  });

  test("a permitted block still selects its existing workspace WAV", async () => {
    storage.exists.mockResolvedValue(true);
    const xml = await (await signedRequest("block")).text();
    expect(xml).toContain(`<Play>https://objects.example/ivr-wav/${workspaces.A}/welcome.wav</Play></Gather>`);
  });

  test("a permitted documented-format block still speaks its content", async () => {
    const steps = JSON.parse(readFileSync(new URL("../fixtures/script-wire/documented-format.json", import.meta.url), "utf8"));
    await sql`update script set steps = ${sql.json(steps)} where id = ${scripts.A} and workspace = ${workspaces.A}`;
    const xml = await (await signedRequest("block", { blockId: "block_1" })).text();
    expect(xml).toContain("Hello, my name is [Agent Name]. I'm calling from [Company].");
    expect(xml).toContain(`<Redirect>https://ivr-workspace.example/api/inbound-ivr/${numbers.A}/page_1/block_2</Redirect>`);
    expect(storage.sign).not.toHaveBeenCalled();
  });
});
