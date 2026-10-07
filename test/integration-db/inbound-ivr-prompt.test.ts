import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const storage = vi.hoisted(() => ({ exists: vi.fn(), sign: vi.fn() }));
// Only the object transport is simulated. Signature, route, call lookup,
// tenant script query, flow and audio rendering are the production code.
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  objectExists: (...args: unknown[]) => storage.exists(...args),
  createSignedObjectUrl: (...args: unknown[]) => storage.sign(...args),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
const callSid = "CA" + randomUUID().replaceAll("-", "");
const accountSid = "AC" + randomUUID().replaceAll("-", "");
const authToken = "owned-inbound-prompt-fixture";
const phone = "+14165552148";
const documented = JSON.parse(readFileSync(new URL("../fixtures/script-wire/documented-format.json", import.meta.url), "utf8"));
let sql: postgres.Sql;
let scriptId: number, numberId: number;
let action: typeof import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server").action;

async function cleanup() {
  await sql`delete from call where sid = ${callSid}`;
  await sql`delete from workspace_number where workspace in (${workspaceId}, ${foreignWorkspaceId})`;
  await sql`delete from script where workspace in (${workspaceId}, ${foreignWorkspaceId})`;
  await sql`delete from workspace where id in (${workspaceId}, ${foreignWorkspaceId})`;
}

async function request(options: { token?: string; pageId?: string; blockId?: string; sid?: string } = {}) {
  const pageId = options.pageId ?? "page_1", blockId = options.blockId ?? "block_1";
  const url = `https://ivr-prompt.example/api/inbound-ivr/${numberId}/${pageId}/${blockId}`;
  const params = { CallSid: options.sid ?? callSid, AccountSid: accountSid };
  const req = new Request(url, { method: "POST", body: new URLSearchParams(params), headers: {
    "X-Twilio-Signature": getExpectedTwilioSignature(options.token ?? authToken, url, params),
  } });
  return asRouteResponse(action({ request: req, url: new URL(url), params: {
    numberId: String(numberId), pageId, blockId,
  }, context: new RouterContextProvider() }));
}

async function recorded(file = "welcome.mp3") {
  await sql`update script set steps = ${sql.json({ pages: { page_1: { blocks: ["block_1"] } },
    blocks: { block_1: { id: "block_1", type: "recorded", audioFile: file } } })}
    where id = ${scriptId} and workspace = ${workspaceId}`;
}

describe.skipIf(!databaseUrl)("inbound prompt playback with real route and tenant data (#2148)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", "https://ivr-prompt.example");
    vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
    sql = postgres(databaseUrl, { max: 2 });
    ({ action } = await import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.action.server"));
  });
  beforeEach(async () => {
    await cleanup();
    storage.exists.mockReset().mockResolvedValue(false);
    storage.sign.mockReset().mockImplementation(async (_bucket, key) => "https://objects.example/" + key);
    await sql`insert into workspace (id, name, twilio_data) values
      (${workspaceId}, 'Owned inbound prompt', ${sql.json({ sid: accountSid, authToken })}),
      (${foreignWorkspaceId}, 'Foreign inbound prompt', '{}')`;
    const [script] = await sql`insert into script (workspace, name, type, steps)
      values (${workspaceId}, 'Documented script', 'inbound_ivr', ${sql.json(documented)}) returning id`;
    scriptId = Number(script.id);
    const [number] = await sql`insert into workspace_number (workspace, type, phone_number, inbound_script_id)
      values (${workspaceId}, 'local', ${phone}, ${scriptId}) returning id`;
    numberId = Number(number.id);
    await sql`insert into call (sid, workspace, "to", account_sid) values (${callSid}, ${workspaceId}, ${phone}, ${accountSid})`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
  });
  afterAll(async () => {
    try { if (sql) await cleanup(); }
    finally {
      await sql?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
      vi.unstubAllEnvs();
    }
  });

  test("a signed inbound request speaks persisted documented content and keeps the inbound redirect", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("Hello, my name is [Agent Name]. I'm calling from [Company].");
    expect(xml).toContain(`<Redirect>https://ivr-prompt.example/api/inbound-ivr/${numberId}/page_1/block_2</Redirect>`);
    expect(storage.sign).not.toHaveBeenCalled();
  });

  test("persisted select content speaks inside Gather", async () => {
    const xml = await (await request({ blockId: "block_2" })).text();
    expect(xml).toContain("Is this a good time to talk?</Say></Gather>");
    expect(xml).toContain(`<Gather action="https://ivr-prompt.example/api/inbound-ivr/${numberId}/page_1/block_2/response"`);
  });

  test("a persisted recording uses the canonical MP3 when its WAV is absent", async () => {
    await recorded();
    const xml = await (await request()).text();
    expect(xml).toContain(`<Play>https://objects.example/${workspaceId}/welcome.mp3</Play>`);
    expect(xml).toContain("<Hangup/>");
  });

  test("a persisted recording selects the existing workspace WAV sidecar", async () => {
    await recorded();
    storage.exists.mockResolvedValue(true);
    const xml = await (await request()).text();
    expect(xml).toContain(`<Play>https://objects.example/ivr-wav/${workspaceId}/welcome.wav</Play>`);
    expect(xml).not.toContain("welcome.mp3</Play>");
  });

  test("an object lookup failure retains recorded playback", async () => {
    await recorded();
    storage.exists.mockRejectedValue(new Error("Owned lookup failure"));
    const xml = await (await request()).text();
    expect(xml).toContain(`<Play>https://objects.example/${workspaceId}/welcome.mp3</Play>`);
  });

  test("a tampered signature cannot read or play the saved prompt", async () => {
    await recorded();
    const response = await request({ token: "wrong-token" });
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("<Hangup/>");
    expect(storage.exists).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
  });

  test("a script attached across workspace boundaries cannot play foreign content", async () => {
    const [foreign] = await sql`insert into script (workspace, name, type, steps)
      values (${foreignWorkspaceId}, 'Foreign script', 'inbound_ivr', ${sql.json(documented)}) returning id`;
    await sql`update workspace_number set inbound_script_id = ${foreign.id} where id = ${numberId} and workspace = ${workspaceId}`;
    const xml = await (await request()).text();
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("Hello, my name");
    expect(storage.sign).not.toHaveBeenCalled();
  });

  test("a signed call to another phone does not play the requested number", async () => {
    await sql`update call set "to" = '+14165552149' where sid = ${callSid}`;
    const xml = await (await request()).text();
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("Hello, my name");
    expect(storage.sign).not.toHaveBeenCalled();
  });
});
