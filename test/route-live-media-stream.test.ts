/**
 * Route-level stream-attachment coverage for the four Twilio TwiML routes that
 * can carry a live media stream.
 *
 * `test/media-stream-twiml.test.ts` already covers the flag matrix inside
 * `appendLiveTranscriptionStreamTwiml`. This file covers the *wiring*: that each
 * route reaches the helper with the right workspace flags and the right
 * route-specific call metadata (direction/ids), and — critically — that when the
 * capabilities are off the route's own TwiML is byte-for-byte unaffected.
 *
 * `twilio` is deliberately NOT mocked here: assertions run against real
 * VoiceResponse XML, so a regression in the `<Start><Stream>` shape is caught.
 */
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { routeArgs } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  env: new Proxy(
    {
      BASE_URL: () => "https://base.example",
      MEDIA_STREAM_HOST: () => "stream.example.com",
      MEDIA_STREAM_SECRET: () => "test-secret",
      TWILIO_PHONE_NUMBER: () => "+15550009999",
    } as Record<string, () => string>,
    { get: (t, p: string) => t[p] ?? (() => "test") },
  ),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getWorkspaceById: vi.fn(),
  getWorkspaceWebhookRow: vi.fn(async () => null),
  getHandsetNumberForWorkspace: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  findActiveHandsetSession: vi.fn(),
  findActiveHandsetSessionClientIdentity: vi.fn(),
  insertCallForWorkspace: vi.fn(async () => null),
  findCallBySid: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({})),
  findWorkspaceNumberByPhoneNumber: vi.fn(),
  upsertInboundCallRecord: vi.fn(),
  findInboundIvrScriptSteps: vi.fn(async () => null),
  resolveInboundVoicemailAudio: vi.fn(async () => null),
  sendWebhookNotification: vi.fn(),
  runAutoDialerTurn: vi.fn(async () => undefined),
  getUserVerifiedAudioNumbers: vi.fn(),
  fetchCampaignByIdForWorkspace: vi.fn(),
  dequeueCampaignQueueByContact: vi.fn(),
  rpcDequeueContact: vi.fn(),
  createSignedObjectUrl: vi.fn(async () => null),
  createTenantDb: vi.fn(() => ({})),
}));

// `twilio`'s package entrypoint pulls in a jsonwebtoken → jwa chain that fails
// to load under vitest. Stub the entrypoint but keep the REAL VoiceResponse, so
// every assertion below still runs against genuine TwiML XML.
vi.mock("twilio", async () => {
  const VoiceResponse = (await import("twilio/lib/twiml/VoiceResponse.js")).default;
  return { default: { twiml: { VoiceResponse }, Twilio: class {} } };
});

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
// Mocked outright rather than via importOriginal: the real module pulls in a
// JWT dep chain that does not load under this suite's module mocks.
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: vi.fn(async () => null),
  twilioWebhookForbidden: (message = "Invalid Twilio signature") =>
    new Response(message, { status: 403 }),
  twilioWebhookBadRequest: (message: string) => new Response(message, { status: 400 }),
  twilioWebhookNotFound: (message = "Not Found") => new Response(message, { status: 404 }),
  twilioWebhookInternalError: (message = "Internal Server Error") =>
    new Response(message, { status: 500 }),
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  getWorkspaceById: (...a: unknown[]) => mocks.getWorkspaceById(...a),
  getWorkspaceWebhookRow: (...a: unknown[]) => mocks.getWorkspaceWebhookRow(...a),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  getHandsetNumberForWorkspace: (...a: unknown[]) =>
    mocks.getHandsetNumberForWorkspace(...a),
  createWorkspaceTwilioInstance: (...a: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...a),
}));
vi.mock("@/lib/handset/handset-session.server", () => ({
  findActiveHandsetSession: (...a: unknown[]) => mocks.findActiveHandsetSession(...a),
  findActiveHandsetSessionClientIdentity: (...a: unknown[]) =>
    mocks.findActiveHandsetSessionClientIdentity(...a),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: (...a: unknown[]) => mocks.insertCallForWorkspace(...a),
  findCallBySid: (...a: unknown[]) => mocks.findCallBySid(...a),
  updateOutreachAttemptForWorkspace: (...a: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...a),
}));
vi.mock("@/lib/inbound-call-db.server", () => ({
  findWorkspaceNumberByPhoneNumber: (...a: unknown[]) =>
    mocks.findWorkspaceNumberByPhoneNumber(...a),
  upsertInboundCallRecord: (...a: unknown[]) => mocks.upsertInboundCallRecord(...a),
  findInboundIvrScriptSteps: (...a: unknown[]) => mocks.findInboundIvrScriptSteps(...a),
  workspaceWebhookHasInboundCallInsert: () => false,
}));
vi.mock("@/lib/inbound-voicemail-twiml.server", () => ({
  resolveInboundVoicemailAudio: (...a: unknown[]) =>
    mocks.resolveInboundVoicemailAudio(...a),
  appendInboundVoicemailTwiml: vi.fn(),
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  sendWebhookNotification: (...a: unknown[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/lib/auto-dial.server", () => ({
  runAutoDialerTurn: (...a: unknown[]) => mocks.runAutoDialerTurn(...a),
}));
vi.mock("@/lib/user-audio.server", () => ({
  getUserVerifiedAudioNumbers: (...a: unknown[]) =>
    mocks.getUserVerifiedAudioNumbers(...a),
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  fetchCampaignByIdForWorkspace: (...a: unknown[]) =>
    mocks.fetchCampaignByIdForWorkspace(...a),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueCampaignQueueByContact: (...a: unknown[]) =>
    mocks.dequeueCampaignQueueByContact(...a),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: (...a: unknown[]) => mocks.rpcDequeueContact(...a),
}));
vi.mock("@/lib/object-storage.server", () => ({
  createSignedObjectUrl: (...a: unknown[]) => mocks.createSignedObjectUrl(...a),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...a: unknown[]) => mocks.createTenantDb(...a),
}));

/** The three capability states each route is exercised against. */
const FLAGS_OFF = {};
const FLAGS_TRANSCRIPTION = { liveTranscription: true };
const FLAGS_COACHING_ONLY = { liveCoaching: true };

function workspaceWithFlags(flags: Record<string, unknown>) {
  return { id: "ws-1", feature_flags: flags };
}

/** Parse the `<Parameter name=... value=.../>` pairs out of a `<Stream>` block. */
function streamParameters(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<Parameter name="([^"]+)" value="([^"]*)"\s*\/>/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

async function readXml(result: unknown): Promise<string> {
  const res = (await result) as Response;
  expect(res.headers.get("Content-Type")).toBe("text/xml");
  return await res.text();
}

// Pay the route + real-TwiML module import cost once, up front. Otherwise the
// first test in the file absorbs several seconds of cold transform and flakes
// against the 5s default timeout.
beforeAll(async () => {
  await Promise.all([
    import("../app/routes/api+/call.action.server"),
    import("../app/routes/api+/dial/$number.action.server"),
    import("../app/routes/api+/auto-dial/$roomId.action.server"),
    import("../app/routes/api+/inbound.action.server"),
  ]);
}, 60000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspaceWebhookRow.mockResolvedValue(null);
  mocks.insertCallForWorkspace.mockResolvedValue(null);
  mocks.runAutoDialerTurn.mockResolvedValue(undefined);
});

describe("api/call — outbound handset call", () => {
  beforeEach(() => {
    mocks.findActiveHandsetSession.mockResolvedValue({ user_id: "user-1" });
    mocks.getHandsetNumberForWorkspace.mockResolvedValue({
      data: { phone_number: "+15550001111" },
    });
  });

  function callRequest() {
    const fd = new FormData();
    fd.set("To", "+15552223333");
    fd.set("workspace_id", "ws-1");
    fd.set("client_identity", "agent-1");
    fd.set("CallSid", "CA-outbound");
    return new Request("http://localhost/api/call", { method: "POST", body: fd });
  }

  async function run() {
    const mod = await import("../app/routes/api+/call.action.server");
    return await readXml(mod.action(routeArgs(callRequest()) as never));
  }

  test("capabilities off: no <Stream>, dial behavior unchanged", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_OFF));
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).not.toContain("<Start");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+15552223333");
  });

  test("liveTranscription on: attaches outbound <Stream> and still dials", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(xml).toContain('track="both_tracks"');
    expect(xml).toContain('name="call-CA-outbound"');
    expect(xml).toContain("<Dial");

    expect(streamParameters(xml)).toMatchObject({
      workspaceId: "ws-1",
      userId: "user-1",
      direction: "outbound",
      callSid: "CA-outbound",
    });
  });

  test("liveCoaching only: still attaches <Stream> (coaching needs the audio)", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_COACHING_ONLY));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(streamParameters(xml)).toMatchObject({ direction: "outbound" });
  });

  test("reads flags from the call's own workspace", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    await run();
    expect(mocks.getWorkspaceById).toHaveBeenCalledWith("ws-1");
  });
});

describe("api/dial/$number — outbound dial", () => {
  beforeEach(() => {
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA-dial",
      workspace: "ws-1",
      user_id: "user-1",
      contact_id: 77,
      campaign_id: 5,
    });
  });

  async function run() {
    const mod = await import("../app/routes/api+/dial/$number.action.server");
    const fd = new FormData();
    fd.set("From", "+15550001111");
    fd.set("CallSid", "CA-dial");
    const request = new Request("http://localhost/api/dial/+15552223333", {
      method: "POST",
      body: fd,
    });
    return await readXml(
      mod.action(routeArgs(request, { number: "+15552223333" }) as never),
    );
  }

  test("capabilities off: no <Stream>, dial behavior unchanged", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_OFF));
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+15552223333");
  });

  test("liveTranscription on: attaches <Stream> with contact/campaign metadata", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(xml).toContain("<Dial");
    expect(streamParameters(xml)).toMatchObject({
      workspaceId: "ws-1",
      userId: "user-1",
      direction: "outbound",
      contactId: "77",
      campaignId: "5",
      callSid: "CA-dial",
    });
  });

  test("liveCoaching only: still attaches <Stream>", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_COACHING_ONLY));
    expect(await run()).toContain("<Stream");
  });

  test("no <Stream> when the call row has no user to attribute the stream to", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA-dial",
      workspace: "ws-1",
      user_id: null,
    });
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).toContain("<Dial");
  });
});

describe("api/auto-dial/$roomId — predictive conference", () => {
  beforeEach(() => {
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA-auto",
      workspace: "ws-1",
      campaign_id: 5,
      contact_id: null,
      conference_id: "user-1~room-abc",
    });
    mocks.fetchCampaignByIdForWorkspace.mockResolvedValue({
      voicemail_file: null,
      group_household_queue: false,
      caller_id: "+15550001111",
    });
    // Non-empty verified numbers + a `client` Called value routes the webhook
    // down the device-check branch, which is the branch that attaches a stream.
    mocks.getUserVerifiedAudioNumbers.mockResolvedValue(["+15550001111"]);
  });

  async function run() {
    const mod = await import("../app/routes/api+/auto-dial/$roomId.action.server");
    const fd = new FormData();
    fd.set("CallSid", "CA-auto");
    fd.set("Called", "client:agent-1");
    fd.set("CallStatus", "in-progress");
    const request = new Request("http://localhost/api/auto-dial/user-1~room-abc", {
      method: "POST",
      body: fd,
    });
    return await readXml(
      mod.action(routeArgs(request, { roomId: "user-1~room-abc" }) as never),
    );
  }

  test("capabilities off: no <Stream>, conference behavior unchanged", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_OFF));
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).toContain("<Conference");
    expect(xml).toContain("user-1~room-abc");
  });

  test("liveTranscription on: attaches predictive <Stream> and still conferences", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(xml).toContain('name="conf-user-1~room-abc"');
    expect(xml).toContain("<Conference");
    expect(streamParameters(xml)).toMatchObject({
      workspaceId: "ws-1",
      userId: "user-1",
      direction: "predictive",
      campaignId: "5",
    });
  });

  test("liveCoaching only: still attaches <Stream>", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_COACHING_ONLY));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(streamParameters(xml)).toMatchObject({ direction: "predictive" });
  });
});

describe("api/inbound — inbound handset call", () => {
  beforeEach(() => {
    mocks.findWorkspaceNumberByPhoneNumber.mockResolvedValue({
      id: "num-1",
      workspaceId: "ws-1",
      handset_enabled: true,
      inbound_ring_count: 4,
      inbound_script_id: null,
      inbound_queue_id: null,
      inbound_action: null,
      inbound_audio: null,
    });
    mocks.upsertInboundCallRecord.mockResolvedValue({
      sid: "CA-inbound",
      from: "+15552223333",
      to: "+15550001111",
      status: "completed",
      direction: "inbound",
      start_time: new Date().toISOString(),
    });
    mocks.findActiveHandsetSessionClientIdentity.mockResolvedValue("agent-1");
    mocks.findActiveHandsetSession.mockResolvedValue({ user_id: "user-1" });
  });

  async function run() {
    const mod = await import("../app/routes/api+/inbound.action.server");
    const fd = new FormData();
    fd.set("Called", "+15550001111");
    fd.set("From", "+15552223333");
    fd.set("CallSid", "CA-inbound");
    fd.set("Direction", "inbound");
    const request = new Request("http://localhost/api/inbound", {
      method: "POST",
      body: fd,
    });
    return await readXml(mod.action(routeArgs(request) as never));
  }

  test("capabilities off: no <Stream>, handset dial behavior unchanged", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_OFF));
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).toContain("<Client>agent-1</Client>");
  });

  test("liveTranscription on: attaches inbound <Stream> and still dials the client", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(xml).toContain('name="inbound-CA-inbound"');
    expect(xml).toContain("<Client>agent-1</Client>");
    expect(streamParameters(xml)).toMatchObject({
      workspaceId: "ws-1",
      userId: "user-1",
      direction: "inbound",
      callSid: "CA-inbound",
    });
  });

  test("liveCoaching only: still attaches <Stream>", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_COACHING_ONLY));
    const xml = await run();

    expect(xml).toContain("<Stream");
    expect(streamParameters(xml)).toMatchObject({ direction: "inbound" });
  });

  test("no <Stream> when there is no resolvable handset session user", async () => {
    mocks.getWorkspaceById.mockResolvedValue(workspaceWithFlags(FLAGS_TRANSCRIPTION));
    mocks.findActiveHandsetSession.mockResolvedValue(null);
    const xml = await run();

    expect(xml).not.toContain("<Stream");
    expect(xml).toContain("<Client>agent-1</Client>");
  });
});

describe("stream attachment is workspace-scoped", () => {
  test("a second workspace with flags off gets no <Stream> on the same route", async () => {
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA-dial",
      workspace: "ws-2",
      user_id: "user-2",
    });
    mocks.getWorkspaceById.mockResolvedValue({
      id: "ws-2",
      feature_flags: FLAGS_OFF,
    });

    const mod = await import("../app/routes/api+/dial/$number.action.server");
    const fd = new FormData();
    fd.set("From", "+15550001111");
    fd.set("CallSid", "CA-dial");
    const request = new Request("http://localhost/api/dial/+15552223333", {
      method: "POST",
      body: fd,
    });
    const xml = await readXml(
      mod.action(routeArgs(request, { number: "+15552223333" }) as never),
    );

    expect(mocks.getWorkspaceById).toHaveBeenCalledWith("ws-2");
    expect(xml).not.toContain("<Stream");
  });
});
