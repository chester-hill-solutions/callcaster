#!/usr/bin/env node
/**
 * Smoke-test integrator API surfaces with a workspace API key.
 * Usage:
 *   API_KEY=cc_live_... BASE_URL=https://... WORKSPACE_ID=... node scripts/one-off/api-key-surface-sweep.mjs
 */
import "dotenv/config";

const BASE = process.env.BASE_URL ?? "https://callcaster-callcaster-pr-1047.up.railway.app";
const WS = process.env.WORKSPACE_ID ?? "4df4d276-4c62-45bb-9fbf-48ab45c5bb7e";
const KEY = process.env.API_KEY;
if (!KEY) {
  console.error("API_KEY is required");
  process.exit(1);
}

const IDS = {
  campaignId: process.env.CAMPAIGN_ID ?? "2",
  liveCampaignId: process.env.LIVE_CAMPAIGN_ID ?? "1",
  scriptId: process.env.SCRIPT_ID ?? "2",
  contactId: process.env.CONTACT_ID ?? "1",
  audienceId: process.env.AUDIENCE_ID ?? "1",
  callerId: process.env.CALLER_ID ?? "+17787448001",
  contactPhone: process.env.CONTACT_PHONE ?? "+19058088017",
  agentUserId: process.env.AGENT_USER_ID ?? "7c113c43-9a85-4406-bc2c-ef9776b54426",
  fakeCallSid: "CA00000000000000000000000000000000",
};

/** @type {{ area: string, method: string, path: string, body?: unknown, expect?: number[], note?: string }[]} */
const cases = [
  // Health / docs (no auth)
  { area: "infra", method: "GET", path: "/healthz", note: "no auth" },
  { area: "infra", method: "GET", path: "/readyz", note: "no auth" },
  { area: "infra", method: "GET", path: "/api/docs/openapi", note: "no auth" },

  // Workspace reads (apiKeyOrSession)
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}` },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/campaigns` },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/scripts` },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/contacts` },
  {
    area: "workspace",
    method: "GET",
    path: `/api/workspaces/${WS}/contacts?phone=${encodeURIComponent(IDS.contactPhone)}`,
    note: "phone lookup",
  },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/audiences` },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/surveys` },
  { area: "workspace", method: "GET", path: `/api/workspaces/${WS}/conversations` },
  {
    area: "workspace",
    method: "GET",
    path: `/api/workspaces/${WS}/conversations/${encodeURIComponent(IDS.contactPhone)}`,
    note: "thread",
  },

  // audit.read scope on key
  {
    area: "workspace",
    method: "GET",
    path: `/api/workspaces/${WS}/audit-events`,
    note: "audit.read capability",
  },

  // Session-only workspace admin (expect 401 with API key)
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/members`, expect: [401] },
  {
    area: "session-only",
    method: "POST",
    path: `/api/workspaces/${WS}/members`,
    body: { email: "probe@example.com", role: "caller" },
    expect: [401],
    note: "members.invite needs session userId",
  },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/api-keys`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/webhook`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/numbers`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/billing`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/analytics`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/exports`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/voicemails`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/audios`, expect: [401] },
  { area: "session-only", method: "GET", path: `/api/workspaces/${WS}/calls`, expect: [401] },

  // Campaign detail (scoped)
  { area: "campaigns", method: "GET", path: `/api/campaigns/${IDS.campaignId}` },
  { area: "campaigns", method: "GET", path: `/api/campaigns/${IDS.campaignId}/queue` },
  {
    area: "session-only",
    method: "GET",
    path: `/api/campaigns/${IDS.campaignId}/results`,
    expect: [401],
  },
  {
    area: "session-only",
    method: "GET",
    path: `/api/campaigns/${IDS.campaignId}/call-session`,
    expect: [401],
  },

  // Contact / script / audience detail
  { area: "contacts", method: "GET", path: `/api/contacts/${IDS.contactId}` },
  { area: "scripts", method: "GET", path: `/api/scripts/${IDS.scriptId}` },
  {
    area: "audiences",
    method: "GET",
    path: `/api/workspaces/${WS}/audiences/${IDS.audienceId}`,
  },

  // Flat dual-auth list routes (query params)
  {
    area: "flat",
    method: "GET",
    path: `/api/audiences?workspaceId=${WS}`,
    note: "flat audience contacts",
  },
  {
    area: "flat",
    method: "GET",
    path: `/api/audiences?audienceId=${IDS.audienceId}`,
    note: "flat audience by id",
  },
  {
    area: "flat",
    method: "GET",
    path: `/api/contacts?q=905&workspace_id=${WS}&campaign_id=${IDS.campaignId}`,
    note: "contact search",
  },
  { area: "flat", method: "GET", path: "/api/numbers?areaCode=416&country=CA", expect: [401] },

  // Writes — create campaign draft
  {
    area: "writes",
    method: "POST",
    path: "/api/campaigns/create-with-script",
    body: {
      workspace_id: WS,
      title: `API sweep ${Date.now()}`,
      type: "simple_ivr",
      caller_id: IDS.callerId,
      script_id: Number(IDS.scriptId),
      status: "draft",
    },
    expect: [200, 201],
    note: "create campaign",
  },

  // Contact create (flat dual-auth)
  {
    area: "writes",
    method: "POST",
    path: "/api/contacts",
    body: {
      workspace_id: WS,
      firstname: "API",
      surname: "Sweep",
      phone: "+15555550199",
      audience_id: Number(IDS.audienceId),
    },
    expect: [200, 201, 409],
    note: "create contact",
  },

  // Audience upsert (flat dual-auth action)
  {
    area: "writes",
    method: "POST",
    path: "/api/audiences",
    body: {
      workspace_id: WS,
      name: `API sweep audience ${Date.now()}`,
    },
    expect: [200, 201],
    note: "create audience",
  },

  // Campaign SMS dispatch (not chat SMS)
  {
    area: "writes",
    method: "POST",
    path: "/api/sms",
    body: {
      workspace_id: WS,
      campaign_id: IDS.campaignId,
      caller_id: IDS.callerId,
    },
    expect: [200, 400, 402, 422],
    note: "campaign sms dispatch",
  },

  // Chat SMS (messages.send)
  {
    area: "writes",
    method: "POST",
    path: "/api/chat_sms",
    body: {
      workspace_id: WS,
      to_number: IDS.contactPhone,
      caller_id: IDS.callerId,
      body: "API sweep — ignore",
      contact_id: IDS.contactId,
    },
    expect: [200, 201, 400, 402, 422],
    note: "chat sms",
  },

  // Dialer start — API key needs agentUserId + device
  {
    area: "writes",
    method: "POST",
    path: `/api/workspaces/${WS}/campaigns/${IDS.liveCampaignId}/dialer/start`,
    body: {
      caller_id: IDS.callerId,
      selected_device: "api-sweep-probe",
      agentUserId: IDS.agentUserId,
    },
    expect: [200, 201, 400, 403, 409, 422, 500],
    note: "dialer start (may fail without live Twilio device)",
  },

  // Call disconnect — calls.control capability, fake SID → 404
  {
    area: "writes",
    method: "POST",
    path: `/api/workspaces/${WS}/calls/${IDS.fakeCallSid}/disconnect`,
    body: {},
    expect: [404, 400],
    note: "disconnect unknown call",
  },
];

async function call(test) {
  const url = `${BASE}${test.path}`;
  const headers = {
    Accept: "application/json",
    "X-API-Key": KEY,
  };
  const init = { method: test.method, headers };

  if (test.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(test.body);
  }

  const started = Date.now();
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return {
      status: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      snippet: "",
    };
  }

  const text = await res.text();
  let snippet = text.replace(/\s+/g, " ").slice(0, 160);
  if (text.startsWith("<!DOCTYPE")) snippet = "(HTML document)";
  return { status: res.status, ms: Date.now() - started, snippet };
}

const results = [];
for (const test of cases) {
  const out = await call(test);
  const expected = test.expect ?? [200, 201, 204];
  const pass = expected.includes(out.status);
  results.push({ ...test, ...out, pass, expected });
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);

console.log(`\nAPI key surface sweep — ${BASE}`);
console.log(`Workspace: ${WS}`);
console.log(`Passed: ${passed}/${results.length}\n`);

const byArea = new Map();
for (const r of results) {
  if (!byArea.has(r.area)) byArea.set(r.area, []);
  byArea.get(r.area).push(r);
}

for (const [area, rows] of byArea) {
  console.log(`## ${area}`);
  for (const r of rows) {
    const mark = r.pass ? "✓" : "✗";
    const exp = ` (expect ${r.expected.join("|")})`;
    const note = r.note ? ` — ${r.note}` : "";
    console.log(
      `${mark} ${r.method} ${r.path} → ${r.status} ${r.ms}ms${exp}${note}`,
    );
    if (r.snippet) console.log(`    ${r.snippet}`);
  }
  console.log("");
}

if (failed.length) {
  console.log("Failures:");
  for (const r of failed) {
    console.log(`- ${r.method} ${r.path}: got ${r.status}, expected ${r.expected.join("|")}`);
    if (r.snippet) console.log(`  ${r.snippet}`);
  }
  process.exit(1);
}
