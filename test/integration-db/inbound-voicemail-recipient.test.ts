import { randomUUID } from "node:crypto";
import postgres from "postgres";
import twilio from "twilio";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { RouterContextProvider } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const provider = vi.hoisted(() => ({ send: vi.fn(), upload: vi.fn(), sign: vi.fn(), fetch: vi.fn(), webhookFetch: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class { emails = { send: provider.send }; },
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: provider.upload,
  createSignedObjectUrl: provider.sign,
}));
vi.mock("@/lib/safe-outbound-url.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-outbound-url.server")>()),
  safeOutboundFetch: provider.webhookFetch,
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreignWorkspace = randomUUID();
const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
const foreignAccountSid = `AC${randomUUID().replaceAll("-", "")}`;
const token = "owned-voicemail-signature-token";
const foreignToken = "owned-foreign-signature-token";
const baseUrl = "https://voicemail-2268.example.test";
const phone = `+1555${Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0")}`;

function flow(target: string) {
  return { startPageId: "page_1", pageOrder: ["page_1"],
    pages: { page_1: { id: "page_1", title: "Menu", blocks: ["block_1"] } },
    blocks: { block_1: { id: "block_1", type: "synthetic", audioFile: "Choose",
      options: [{ value: "1", label: "Leave a message", next: target }] } } };
}
function request(path: string, params: Record<string, string>, authToken = token) {
  const url = baseUrl + path;
  return new Request(url, { method: "POST", body: new URLSearchParams(params),
    headers: { "X-Twilio-Signature": twilio.getExpectedTwilioSignature(authToken, url, params) } });
}

suite("inbound voicemail recipient delivery (#2268)", () => {
  let client: postgres.Sql;
  let callSid: string;
  let recordingSid: string;
  let numberId: number;
  let scriptId: number;
  let responseAction: typeof import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server").action;
  let emailAction: typeof import("../../app/routes/api+/email-vm.action.server").action;

  async function cleanup() {
    await client`delete from webhook where workspace in (${workspace}, ${foreignWorkspace})`;
    await client`delete from call where workspace in (${workspace}, ${foreignWorkspace})`;
    await client`delete from workspace_number where workspace in (${workspace}, ${foreignWorkspace})`;
    await client`delete from script where workspace in (${workspace}, ${foreignWorkspace})`;
    await client`delete from workspace where id in (${workspace}, ${foreignWorkspace})`;
  }
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Voicemail cases require a real database");
    vi.stubEnv("DATABASE_URL", databaseUrl); vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BASE_URL", baseUrl); vi.stubEnv("TWILIO_VALIDATE_WEBHOOKS", "true");
    vi.stubEnv("RESEND_API_KEY", "owned-test-resend-placeholder");
    client = postgres(databaseUrl, { max: 4 });
    responseAction = (await import("../../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.action.server")).action;
    emailAction = (await import("../../app/routes/api+/email-vm.action.server")).action;
  });
  beforeEach(async () => {
    await cleanup();
    callSid = `CA${randomUUID().replaceAll("-", "")}`;
    recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
    await client`insert into workspace (id, name, credits, twilio_data) values
      (${workspace}, 'Owned voicemail', 100, ${client.json({ sid: accountSid, authToken: token })}),
      (${foreignWorkspace}, 'Foreign voicemail', 100, ${client.json({ sid: foreignAccountSid, authToken: foreignToken })})`;
    const [script] = await client`insert into script (workspace, name, type, steps)
      values (${workspace}, ${randomUUID()}, 'inbound_ivr', ${client.json(flow("voicemail:script@example.test"))}) returning id`;
    scriptId = Number(script.id);
    const [number] = await client`insert into workspace_number (workspace, type, phone_number, inbound_action, inbound_script_id)
      values (${workspace}, 'local', ${phone}, 'default@example.test', ${scriptId}) returning id`;
    numberId = Number(number.id);
    await client`insert into call (sid, workspace, account_sid, "from", "to", direction)
      values (${callSid}, ${workspace}, ${accountSid}, '+15555550101', ${phone}, 'inbound')`;
    provider.send.mockReset(); provider.upload.mockReset(); provider.sign.mockReset(); provider.fetch.mockReset();
    provider.webhookFetch.mockReset().mockImplementation(async () => new Response(null, { status: 204 }));
    provider.send.mockResolvedValue({ data: { id: "owned-email-id" }, error: null });
    provider.upload.mockResolvedValue(undefined); provider.sign.mockResolvedValue("https://owned-storage.example.test/voicemail.mp3");
    provider.fetch.mockImplementation(async () => new Response("owned fake recording", { status: 200, headers: { "Content-Type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", provider.fetch);
  });
  afterAll(async () => {
    try { if (client) await cleanup(); }
    finally {
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    }
  });
  async function route() {
    return asRouteResponse(responseAction({ request: request(`/api/inbound-ivr/${numberId}/page_1/block_1/response`, {
      CallSid: callSid, AccountSid: accountSid, Digits: "1",
    }), params: { numberId: String(numberId), pageId: "page_1", blockId: "block_1" }, context: new RouterContextProvider() }));
  }
  async function callback(options: { authToken?: string; account?: string; fields?: Record<string, string> } = {}) {
    return asRouteResponse(emailAction({ request: request("/api/email-vm", {
      CallSid: callSid, AccountSid: options.account ?? accountSid, RecordingSid: recordingSid,
      RecordingUrl: `https://api.twilio.com/2010-04-01/Accounts/${options.account ?? accountSid}/Recordings/${recordingSid}`,
      RecordingDuration: "12", ...options.fields,
    }, options.authToken), params: {}, context: new RouterContextProvider() }));
  }

  async function storedCopies() {
    vi.stubEnv("S3_ENDPOINT", "https://owned-storage.example.test");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "owned-storage-key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "owned-storage-secret");
    vi.stubEnv("S3_BUCKET_AUDIO", "owned-voicemail-copies");
    const storage = await vi.importActual<
      typeof import("@/lib/object-storage.server")
    >("@/lib/object-storage.server");
    provider.upload.mockImplementation(storage.uploadObject);
    const objects = new Map<string, string>();
    const writes: Array<{ key: string; condition: string | undefined }> = [];
    const transport = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation(async (command) => {
        if (command instanceof HeadObjectCommand) {
          if (command.input.Key && objects.has(command.input.Key)) return {};
          throw Object.assign(new Error("Missing object"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          });
        }
        if (!(command instanceof PutObjectCommand))
          throw new Error("Unexpected storage command");
        const { Bucket, Key, Body, IfNoneMatch } = command.input;
        if (
          Bucket !== "owned-voicemail-copies" ||
          !Key ||
          !Buffer.isBuffer(Body)
        )
          throw new Error("Invalid object write");
        writes.push({ key: Key, condition: IfNoneMatch });
        if (IfNoneMatch === "*" && objects.has(Key)) {
          throw Object.assign(new Error("Existing object"), {
            name: "PreconditionFailed",
            $metadata: { httpStatusCode: 412 },
          });
        }
        objects.set(Key, Body.toString());
        return {};
      });
    return { objects, writes, restore: () => transport.mockRestore() };
  }

  test("a preparation retry replaces the same voicemail object through the actual storage adapter", async () => {
    const copies = await storedCopies();
    const key = `voicemail/${workspace}/voicemail-${callSid}-${recordingSid}.mp3`;
    const started = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(started);
    try {
      await route();
      provider.sign.mockRejectedValueOnce(new Error("Owned signing failure"));
      provider.fetch.mockResolvedValueOnce(
        new Response("first copy", {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      );
      expect((await callback()).status).toBe(500);
      expect(copies.objects.get(key)).toBe("first copy");
      expect(provider.send).not.toHaveBeenCalled();
      vi.setSystemTime(new Date(started.getTime() + 10_000));
      provider.fetch.mockResolvedValueOnce(
        new Response("replacement copy", {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      );
      expect((await callback()).status).toBe(200);
      expect((await callback()).status).toBe(200);
      expect([...copies.objects.entries()]).toEqual([
        [key, "replacement copy"],
      ]);
      expect(copies.writes).toEqual([
        { key, condition: undefined },
        { key, condition: undefined },
      ]);
      expect(provider.fetch).toHaveBeenCalledTimes(2);
      expect(provider.send).toHaveBeenCalledTimes(1);
    } finally {
      copies.restore();
      vi.useRealTimers();
    }
  });

  test("another RecordingSid keeps a separate voicemail object for the same call", async () => {
    const copies = await storedCopies();
    const firstKey = `voicemail/${workspace}/voicemail-${callSid}-${recordingSid}.mp3`;
    const started = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(started);
    try {
      await route();
      expect((await callback()).status).toBe(200);
      vi.setSystemTime(new Date(started.getTime() + 10_000));
      recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
      const secondKey = `voicemail/${workspace}/voicemail-${callSid}-${recordingSid}.mp3`;
      expect((await callback()).status).toBe(200);
      expect([...copies.objects.keys()]).toEqual([firstKey, secondKey]);
      expect(copies.writes).toEqual([
        { key: firstKey, condition: undefined },
        { key: secondKey, condition: undefined },
      ]);
      expect(provider.send).toHaveBeenCalledTimes(2);
    } finally {
      copies.restore();
      vi.useRealTimers();
    }
  });

  test("the bound recipient survives an old workspace row for the same phone", async () => {
    await client`delete from workspace_number where workspace = ${workspace} and phone_number = ${phone}`;
    await client`insert into workspace_number (workspace, type, phone_number, inbound_action) values (${foreignWorkspace}, 'local', ${phone}, 'old-owner@example.test')`;
    const [active] = await client`insert into workspace_number (workspace, type, phone_number, inbound_action, inbound_script_id) values (${workspace}, 'local', ${phone}, 'default@example.test', ${scriptId}) returning id`;
    numberId = Number(active.id);
    expect((await route()).status).toBe(200);
    expect((await callback()).status).toBe(200);
    expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });
  test("the IVR script inbox receives the recording instead of a different number default", async () => {
    expect(await (await route()).text()).toContain("<Record");
    const delivered = await callback(); expect(delivered.status).toBe(200);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });
  test("legacy recording delivery retains the number default when there is no IVR binding", async () => {
    expect((await callback()).status).toBe(200);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].to).toEqual(["default@example.test"]);
  });
  test("a valid signature for another workspace cannot send through this number", async () => {
    await client`update call set workspace = ${foreignWorkspace}, account_sid = ${foreignAccountSid} where sid = ${callSid}`;
    const delivered = await callback({ authToken: foreignToken, account: foreignAccountSid });
    expect(delivered.status).toBe(403); expect(provider.send).not.toHaveBeenCalled(); expect(provider.upload).not.toHaveBeenCalled();
  });
  test("invalid legacy voicemail targets do not emit Record TwiML", async () => {
    await client`update script set steps = ${client.json(flow("voicemail:a..b@example.test"))} where workspace = ${workspace} and id = ${scriptId}`;
    expect(await (await route()).text()).not.toContain("<Record"); expect(provider.send).not.toHaveBeenCalled();
  });
  test("a wrong signature blocks recording delivery before provider work", async () => {
    expect((await callback({ authToken: "wrong-token" })).status).toBe(403);
    expect(provider.send).not.toHaveBeenCalled(); expect(provider.fetch).not.toHaveBeenCalled();
  });
  test("script edits and duplicate menu responses cannot replace the bound inbox", async () => {
    await route();
    await client`update script set steps = ${client.json(flow("voicemail:edited@example.test"))} where workspace = ${workspace} and id = ${scriptId}`;
    await client`update workspace_number set inbound_action = 'changed-default@example.test' where workspace = ${workspace} and id = ${numberId}`;
    await route(); expect((await callback()).status).toBe(200);
    expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });
  test("callback email fields cannot override the stored recipient", async () => {
    await route(); expect((await callback({ fields: { Email: "forged@example.test", recipient: "forged@example.test", To: "+15555550199" } })).status).toBe(200);
    expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });
  test("another call on the same number gets its own script recipient", async () => {
    await route(); const firstCall = callSid; const firstRecording = recordingSid;
    callSid = `CA${randomUUID().replaceAll("-", "")}`; recordingSid = `RE${randomUUID().replaceAll("-", "")}`;
    await client`insert into call (sid, workspace, account_sid, "from", "to", direction) values (${callSid}, ${workspace}, ${accountSid}, '+15555550102', ${phone}, 'inbound')`;
    await client`update script set steps = ${client.json(flow("voicemail:second@example.test"))} where workspace = ${workspace} and id = ${scriptId}`;
    await route(); expect((await callback()).status).toBe(200);
    callSid = firstCall; recordingSid = firstRecording; expect((await callback()).status).toBe(200);
    expect(provider.send.mock.calls.map(call => call[0].to)).toEqual([["second@example.test"], ["script@example.test"]]);
  });
  test("a cross-workspace menu response cannot record or bind an inbox", async () => {
    await client`update call set workspace = ${foreignWorkspace}, account_sid = ${foreignAccountSid} where sid = ${callSid}`;
    const result = await asRouteResponse(responseAction({ request: request(`/api/inbound-ivr/${numberId}/page_1/block_1/response`, { CallSid: callSid, AccountSid: foreignAccountSid, Digits: "1" }, foreignToken), params: { numberId: String(numberId), pageId: "page_1", blockId: "block_1" }, context: new RouterContextProvider() }));
    expect(await result.text()).not.toContain("<Record");
    expect(await client`select call_sid from inbound_voicemail_recipient where call_sid = ${callSid}`).toHaveLength(0);
  });
  test("a general recording URL write cannot suppress bound IVR delivery", async () => {
    await route(); await client`update call set recording_url = ${`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}`} where sid = ${callSid}`;
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });
  test("a completed callback replay does not resend or rebuild the email", async () => {
    await route(); expect((await callback()).status).toBe(200); expect((await callback()).status).toBe(200);
    expect(provider.send).toHaveBeenCalledTimes(1); expect(provider.fetch).toHaveBeenCalledTimes(1); expect(provider.sign).toHaveBeenCalledTimes(1);
  });
  test("provider retry preserves the exact payload and key after settings change", async () => {
    await route(); provider.send.mockResolvedValueOnce({ data: null, error: { message: "temporary provider error" } });
    expect((await callback()).status).toBe(500);
    await client`update workspace_number set inbound_action = 'wrong-inbox@example.test' where workspace = ${workspace} and id = ${numberId}`;
    provider.sign.mockResolvedValue("https://changed-storage.example.test/changed-link.mp3");
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(2);
    const [first, second] = provider.send.mock.calls;
    expect(first[1].idempotencyKey).toEqual(expect.any(String)); expect(first[1].idempotencyKey.length).toBeGreaterThan(0);
    expect(second).toEqual(first); expect(second[0].to).toEqual(["script@example.test"]);
    expect(provider.fetch).toHaveBeenCalledTimes(1); expect(provider.sign).toHaveBeenCalledTimes(1);
  });
  test("legacy retries keep their first valid inbox after the number default is cleared", async () => {
    provider.send.mockResolvedValueOnce({ data: null, error: { message: "temporary provider error" } });
    expect((await callback()).status).toBe(500);
    await client`update workspace_number set inbound_action = null where workspace = ${workspace} and id = ${numberId}`;
    expect((await callback()).status).toBe(200);
    expect(provider.send.mock.calls[1][0].to).toEqual(["default@example.test"]);
    expect(provider.send.mock.calls[1]).toEqual(provider.send.mock.calls[0]);
  });
  test("concurrent callbacks cannot own two email attempts", async () => {
    await route(); let release: () => void = () => {}; let entered: () => void = () => {};
    const providerEntered = new Promise<void>(resolve => { entered = resolve; });
    const providerReleased = new Promise<void>(resolve => { release = resolve; });
    provider.send.mockImplementationOnce(async () => { entered(); await providerReleased; return { data: { id: "owned-email-id" }, error: null }; });
    const running = callback();
    try {
      await Promise.race([providerEntered, new Promise((_, reject) => setTimeout(() => reject(new Error("Provider attempt did not start")), 5_000))]);
      expect((await callback()).status).toBe(503); expect(provider.send).toHaveBeenCalledTimes(1);
    } finally { release(); await running; }
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(1);
  });
  test("an uncertain retry outside the provider key window does not send again or choose another inbox", async () => {
    await route(); provider.send.mockResolvedValueOnce({ data: null, error: { message: "unknown delivery result" } });
    expect((await callback()).status).toBe(500);
    await client`update inbound_voicemail_delivery set first_send_at = now() - interval '25 hours' where workspace = ${workspace} and call_sid = ${callSid}`;
    await client`update workspace_number set inbound_action = 'wrong@example.test' where workspace = ${workspace} and id = ${numberId}`;
    expect((await callback()).status).toBe(503); expect(provider.send).toHaveBeenCalledTimes(1);
    const [row] = await client`select state, recipient, resend_email_id from inbound_voicemail_delivery where workspace = ${workspace} and call_sid = ${callSid}`;
    expect(row).toMatchObject({ state: "uncertain", recipient: "script@example.test", resend_email_id: null });
  });
  test("a failed call URL write recovers the enabled webhook without another email", async () => {
    await client`insert into webhook (workspace, destination_url, events) values (${workspace}, 'https://owned-webhook.example.test/voicemail', ${client.json([{ category: "voicemail", type: "INSERT" }])})`;
    await route(); const fn = `vm_url_${randomUUID().replaceAll("-", "")}`; const trigger = fn + "_trigger";
    try {
      await client.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin if NEW.sid = '${callSid}' and NEW.recording_url is not null then raise exception 'owned URL failure' using errcode = '40001'; end if; return NEW; end $$`);
      await client.unsafe(`create trigger ${trigger} before update on public.call for each row execute function public.${fn}()`);
      expect((await callback()).status).toBe(500); expect(provider.send).toHaveBeenCalledTimes(1);
      expect(provider.webhookFetch).not.toHaveBeenCalled();
    } finally { await client.unsafe(`drop trigger if exists ${trigger} on public.call`); await client.unsafe(`drop function if exists public.${fn}()`); }
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.webhookFetch).toHaveBeenCalledTimes(1);
    expect(provider.webhookFetch.mock.calls[0][0]).toBe("https://owned-webhook.example.test/voicemail");
    const notification = JSON.parse(provider.webhookFetch.mock.calls[0][1].body);
    expect(notification).toMatchObject({ event_category: "voicemail", event_type: "INSERT", workspace_id: workspace,
      payload: { call_sid: callSid, recording_url: "https://owned-storage.example.test/voicemail.mp3" } });
    expect((await callback()).status).toBe(200);
    expect(provider.webhookFetch).toHaveBeenCalledTimes(1); expect(provider.send).toHaveBeenCalledTimes(1);
    const [row] = await client`select recording_url from call where workspace = ${workspace} and sid = ${callSid}`;
    expect(row.recording_url).toContain(recordingSid);
  });
  test("a webhook without the voicemail event does not receive the recording", async () => {
    await client`insert into webhook (workspace, destination_url, events) values (${workspace}, 'https://owned-webhook.example.test/other', ${client.json([{ category: "outreach_attempt", type: "INSERT" }])})`;
    await route(); expect((await callback()).status).toBe(200);
    expect(provider.send).toHaveBeenCalledTimes(1); expect(provider.webhookFetch).not.toHaveBeenCalled();
  });
  test("a failed delivery receipt reuses the provider key and frozen payload", async () => {
    await route(); const fn = `vm_receipt_${randomUUID().replaceAll("-", "")}`; const trigger = fn + "_trigger";
    try {
      await client.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin if NEW.call_sid = '${callSid}' and NEW.state = 'sent' then raise exception 'owned receipt failure' using errcode = '40001'; end if; return NEW; end $$`);
      await client.unsafe(`create trigger ${trigger} before update on public.inbound_voicemail_delivery for each row execute function public.${fn}()`);
      expect((await callback()).status).toBe(500); expect(provider.send).toHaveBeenCalledTimes(1);
    } finally { await client.unsafe(`drop trigger if exists ${trigger} on public.inbound_voicemail_delivery`); await client.unsafe(`drop function if exists public.${fn}()`); }
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send.mock.calls[0][1].idempotencyKey).toEqual(expect.any(String));
    expect(provider.send.mock.calls[1]).toEqual(provider.send.mock.calls[0]); expect(provider.fetch).toHaveBeenCalledTimes(1);
  });
  test("a recording identity collision is rejected before another send", async () => {
    await route(); expect((await callback()).status).toBe(200);
    expect((await callback({ fields: { RecordingUrl: "https://different.example.test/recording" } })).status).toBe(500);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  test("callback AccountSid cannot select another account's recording with this call", async () => {
    await route(); expect((await callback({ account: foreignAccountSid })).status).toBe(403);
    expect(provider.fetch).not.toHaveBeenCalled(); expect(provider.send).not.toHaveBeenCalled();
  });
  test("an unknown call is acknowledged without provider work", async () => {
    callSid = `CA${randomUUID().replaceAll("-", "")}`;
    expect((await callback()).status).toBe(200); expect(provider.fetch).not.toHaveBeenCalled(); expect(provider.send).not.toHaveBeenCalled();
  });
  test("a changed dialed number cannot fall back from an existing IVR binding to another inbox", async () => {
    await route(); const changedPhone = "+15555550998";
    await client`insert into workspace_number (workspace, type, phone_number, inbound_action) values (${workspace}, 'local', ${changedPhone}, 'wrong@example.test')`;
    await client`update call set "to" = ${changedPhone} where sid = ${callSid}`;
    expect((await callback()).status).toBe(500); expect(provider.send).not.toHaveBeenCalled();
  });
  test("concurrent menu responses preserve one bound recipient and both remain recordable", async () => {
    const responses = await Promise.all([route(), route()]);
    for (const response of responses) expect(await response.text()).toContain("<Record");
    expect(await client`select recipient from inbound_voicemail_recipient where workspace = ${workspace} and call_sid = ${callSid}`).toEqual([{ recipient: "script@example.test" }]);
    expect((await callback()).status).toBe(200); expect(provider.send.mock.calls[0][0].to).toEqual(["script@example.test"]);
  });

  test("a safe retry cannot restart the provider's original expiry window", async () => {
    await route(); provider.send.mockResolvedValue({ data: null, error: { message: "uncertain provider result" } });
    expect((await callback()).status).toBe(500);
    await client`update inbound_voicemail_delivery set first_send_at = now() - interval '22 hours' where workspace = ${workspace} and call_sid = ${callSid}`;
    const [before] = await client`select first_send_at from inbound_voicemail_delivery where workspace = ${workspace} and call_sid = ${callSid}`;
    expect((await callback()).status).toBe(500);
    const [after] = await client`select first_send_at from inbound_voicemail_delivery where workspace = ${workspace} and call_sid = ${callSid}`;
    expect(after.first_send_at).toEqual(before.first_send_at);
  });
  test("recipient binding must commit before Record TwiML is emitted", async () => {
    const fn = `vm_bind_${randomUUID().replaceAll("-", "")}`; const trigger = fn + "_trigger";
    try {
      await client.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin if NEW.call_sid = '${callSid}' then raise exception 'owned binding failure' using errcode = '40001'; end if; return NEW; end $$`);
      await client.unsafe(`create trigger ${trigger} before insert on public.inbound_voicemail_recipient for each row execute function public.${fn}()`);
      expect(await (await route()).text()).not.toContain("<Record");
      expect(await client`select call_sid from inbound_voicemail_recipient where call_sid = ${callSid}`).toHaveLength(0);
    } finally { await client.unsafe(`drop trigger if exists ${trigger} on public.inbound_voicemail_recipient`); await client.unsafe(`drop function if exists public.${fn}()`); }
    expect(await (await route()).text()).toContain("<Record");
  });
  test("a failed durable preparation cannot send an email", async () => {
    await route(); const fn = `vm_prepare_${randomUUID().replaceAll("-", "")}`; const trigger = fn + "_trigger";
    try {
      await client.unsafe(`create function public.${fn}() returns trigger language plpgsql as $$ begin if NEW.call_sid = '${callSid}' then raise exception 'owned preparation failure' using errcode = '40001'; end if; return NEW; end $$`);
      await client.unsafe(`create trigger ${trigger} before insert on public.inbound_voicemail_delivery for each row execute function public.${fn}()`);
      expect((await callback()).status).toBe(500); expect(provider.send).not.toHaveBeenCalled();
    } finally { await client.unsafe(`drop trigger if exists ${trigger} on public.inbound_voicemail_delivery`); await client.unsafe(`drop function if exists public.${fn}()`); }
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(1);
  });

  test.each(["", 123])("a missing or malformed provider receipt (%s) cannot mark delivery sent", async (id) => {
    await route(); provider.send.mockResolvedValueOnce({ data: { id }, error: null });
    expect((await callback()).status).toBe(500);
    const [row] = await client`select state, resend_email_id from inbound_voicemail_delivery where workspace = ${workspace} and call_sid = ${callSid}`;
    expect(row).toMatchObject({ state: "prepared", resend_email_id: null });
    expect((await callback()).status).toBe(200); expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send.mock.calls[1]).toEqual(provider.send.mock.calls[0]);
  });

});
