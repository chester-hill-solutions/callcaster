import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({ signature: vi.fn(), call: vi.fn(), campaignCall: vi.fn(),
  campaign: vi.fn(), number: vi.fn(), upsert: vi.fn(), steps: vi.fn(), context: vi.fn(), webhook: vi.fn() }));
vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-webhook.server")>()),
  requireTwilioSignature: (...args: unknown[]) => mocks.signature(...args),
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  findCallBySid: (...args: unknown[]) => mocks.call(...args),
  findCallWithCampaignScriptBySid: (...args: unknown[]) => mocks.campaignCall(...args),
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  fetchCampaignWithScript: (...args: unknown[]) => mocks.campaign(...args),
}));
vi.mock("@/lib/inbound-call-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-call-db.server")>()),
  findWorkspaceNumberByPhoneNumber: (...args: unknown[]) => mocks.number(...args),
  upsertInboundCallRecord: (...args: unknown[]) => mocks.upsert(...args),
  findInboundIvrScriptSteps: (...args: unknown[]) => mocks.steps(...args),
}));
vi.mock("@/lib/inbound-ivr-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-ivr-db.server")>()),
  loadInboundIvrBlockContext: (...args: unknown[]) => mocks.context(...args),
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-members-db.server")>()),
  getWorkspaceWebhookRow: (...args: unknown[]) => mocks.webhook(...args),
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env, BASE_URL: () => "https://base.example" } };
});

const script = {
  pages: { page_1: { blocks: ["a"] }, tiny: { blocks: ["b"] }, chosen_start: { blocks: ["c"] } },
  blocks: {
    a: { id: "a", type: "say", audioFile: "Old first" },
    b: { id: "b", type: "say", audioFile: "Old second" },
    c: { id: "c", type: "say", audioFile: "Saved start" },
  },
  startPageId: "chosen_start", pageOrder: ["chosen_start", "page_1", "tiny"],
};
const call = { sid: "CA1", to: "+15551234567", from: "+15550001111", workspace: "w1",
  campaign_id: 1, outreach_attempt_id: null, campaign: { script: { steps: script } } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signature.mockResolvedValue(null);
  mocks.call.mockResolvedValue(call);
  mocks.campaignCall.mockResolvedValue(call);
  mocks.campaign.mockResolvedValue(call.campaign);
  mocks.number.mockResolvedValue({ id: 42, workspaceId: "w1", inbound_script_id: 99 });
  mocks.upsert.mockResolvedValue(call);
  mocks.steps.mockResolvedValue(script);
  mocks.context.mockResolvedValue({ number: { id: 42, workspaceId: "w1", phoneNumber: call.to }, script });
  mocks.webhook.mockResolvedValue(null);
});

async function invoke(kind: "entry" | "page" | "inbound" | "out-response" | "in-response",
  extras: Record<string, string> = {}, pageId = "chosen_start", blockId = "c") {
  const paths = { entry: "/api/ivr/1/", page: `/api/ivr/1/${pageId}/`, inbound: "/api/inbound",
    "out-response": `/api/ivr/1/${pageId}/${blockId}/response`,
    "in-response": `/api/inbound-ivr/42/${pageId}/${blockId}/response` };
  const request = new Request("https://base.example" + paths[kind], { method: "POST",
    body: new URLSearchParams({ CallSid: "CA1", Called: call.to, To: call.to, From: call.from, ...extras }) });
  const params = kind === "entry" ? { campaignId: "1" } : { campaignId: "1", numberId: "42", pageId, blockId };
  const args = { request, url: new URL(request.url), params, context: new RouterContextProvider() };
  const action = kind === "entry" ? (await import("../app/routes/api+/ivr/$campaignId.route")).action
    : kind === "page" ? (await import("../app/routes/api+/ivr/$campaignId/$pageId.route")).action
    : kind === "inbound" ? (await import("../app/routes/api+/inbound")).action
    : kind === "out-response" ? (await import("../app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.route")).action
    : (await import("../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route")).action;
  return asRouteResponse(action(args));
}

describe("IVR caller entry and page order (#2087)", () => {
  test("outbound entry renders the saved start inline rather than page_1", async () => {
    const xml = await (await invoke("entry")).text();
    expect(xml).toContain("Saved start");
    expect(xml).not.toContain("Old first");
    expect(xml).toContain("<Redirect>https://base.example/api/ivr/1/page_1/a</Redirect>");
    expect(xml).not.toContain("<Redirect>https://base.example/api/ivr/1/chosen_start/c</Redirect>");
  });
  test("a valid explicit page remains the requested page", async () => {
    const xml = await (await invoke("page", {}, "page_1", "a")).text();
    expect(xml).toContain("Old first");
    expect(xml).not.toContain("Saved start");
  });
  test("legacy entry without metadata uses the existing first page", async () => {
    mocks.campaignCall.mockResolvedValue({ ...call, campaign: { script: { steps: { pages: script.pages, blocks: script.blocks } } } });
    expect(await (await invoke("entry")).text()).toContain("Old first");
  });
  test("dangling outbound start cannot silently play another page", async () => {
    mocks.campaignCall.mockResolvedValue({ ...call, campaign: { script: { steps: { ...script, startPageId: "deleted" } } } });
    const xml = await (await invoke("entry")).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("Old first");
  });
  test("the entry route rejects an invalid signature before loading the call", async () => {
    mocks.signature.mockResolvedValue(new Response("Forbidden", { status: 403 }));
    expect((await invoke("entry")).status).toBe(403);
    expect(mocks.campaignCall).not.toHaveBeenCalled();
  });
  test("the entry route rejects a stored call from another campaign", async () => {
    mocks.campaignCall.mockResolvedValue({ ...call, campaign_id: 2 });
    const xml = await (await invoke("entry")).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("Saved start");
  });
  test("machine answers keep the existing hangup policy before entry rendering", async () => {
    const xml = await (await invoke("entry", { AnsweredBy: "machine_start" })).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("Saved start");
  });
  test("inbound entry redirects to the saved start page and its first block", async () => {
    expect(await (await invoke("inbound")).text())
      .toContain("<Redirect>/api/inbound-ivr/42/chosen_start/c</Redirect>");
  });
  test("dangling inbound start does not choose the first page", async () => {
    mocks.steps.mockResolvedValue({ ...script, startPageId: "deleted" });
    expect(await (await invoke("inbound")).text()).not.toContain("/api/inbound-ivr/");
  });
  test.each(["out-response", "in-response"] as const)("%s uses the authored next page when no input is received", async (kind) => {
    const xml = await (await invoke(kind)).text();
    const prefix = kind === "out-response" ? "ivr/1" : "inbound-ivr/42";
    expect(xml).toContain(`<Redirect>https://base.example/api/${prefix}/page_1/a/</Redirect>`);
  });
  test.each(["out-response", "in-response"] as const)("%s ends at the last authored page", async (kind) => {
    const xml = await (await invoke(kind, {}, "tiny", "b")).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("<Redirect>");
  });
});
