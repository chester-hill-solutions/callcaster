import { beforeEach, describe, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  signature: vi.fn(), ivrSignature: vi.fn(), number: vi.fn(), upsert: vi.fn(),
  call: vi.fn(), blockContext: vi.fn(), queue: vi.fn(), webhook: vi.fn(),
}));

vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env, BASE_URL: () => "https://base.example/" } };
});
vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-webhook.server")>()),
  requireTwilioSignature: (...args: unknown[]) => mocks.signature(...args),
}));
vi.mock("@/lib/ivr-webhook-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ivr-webhook-auth.server")>()),
  requireTwilioSignatureForIvrResponse: (...args: unknown[]) => mocks.ivrSignature(...args),
}));
vi.mock("@/lib/inbound-call-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-call-db.server")>()),
  findWorkspaceNumberByPhoneNumber: (...args: unknown[]) => mocks.number(...args),
  upsertInboundCallRecord: (...args: unknown[]) => mocks.upsert(...args),
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-members-db.server")>()),
  getWorkspaceWebhookRow: (...args: unknown[]) => mocks.webhook(...args),
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  findCallBySid: (...args: unknown[]) => mocks.call(...args),
}));
vi.mock("@/lib/inbound-ivr-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-ivr-db.server")>()),
  loadInboundIvrBlockContext: (...args: unknown[]) => mocks.blockContext(...args),
}));
vi.mock("@/lib/inbound-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-queue-db.server")>()),
  findInboundQueueInWorkspace: (...args: unknown[]) => mocks.queue(...args),
}));

const called = "+15551234567";
const callSid = "CA-test&queue_id=999";
const caller = "+15550001111&queue_id=999";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signature.mockResolvedValue(null);
  mocks.ivrSignature.mockResolvedValue({ callSid, userInput: "1" });
  mocks.number.mockResolvedValue({ id: 42, workspaceId: "w1", inbound_queue_id: 7 });
  mocks.upsert.mockResolvedValue({ sid: callSid, to: called, from: caller });
  mocks.call.mockResolvedValue({ sid: callSid, to: called, from: caller, workspace: "w1" });
  mocks.webhook.mockResolvedValue(null);
  mocks.queue.mockResolvedValue({ id: 7 });
  mocks.blockContext.mockResolvedValue({
    number: { id: 42, workspaceId: "w1", phoneNumber: called },
    script: { pages: { p1: { blocks: ["b1"] } }, blocks: { b1: { id: "b1", options: [{ value: "1", next: "queue:7" }] } } },
  });
});

async function response(path: "number" | "ivr") {
  const request = new Request("https://base.example/api/inbound", {
    method: "POST", body: new URLSearchParams({ Called: called, To: called, CallSid: callSid, From: "untrusted-IVR-field", Digits: "1" }),
  });
  const args = { request, url: new URL(request.url), context: new RouterContextProvider(), params: {} };
  if (path === "number") {
    const { action } = await import("../app/routes/api+/inbound");
    // The direct entry uses the signed provider payload; the IVR callback uses the stored call.
    const directRequest = new Request(request.url, { method: "POST", body: new URLSearchParams({ Called: called, To: called, CallSid: callSid, From: caller }) });
    return asRouteResponse(action({ ...args, request: directRequest }));
  }
  const { action } = await import("../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route");
  return asRouteResponse(action({ ...args, params: { numberId: "42", pageId: "p1", blockId: "b1" } }));
}

function attribute(xml: string, name: string) {
  const match = xml.match(new RegExp(`${name}="([^"]+)"`));
  if (!match?.[1]) throw new Error(`Missing ${name}: ${xml}`);
  return match[1].replaceAll("&amp;", "&");
}

describe.each(["number", "ivr"] as const)("%s inbound queue entry (#2271)", (path) => {
  test("emits the queue name as Enqueue text with both ACD callbacks and exact values", async () => {
    const xml = await (await response(path)).text();
    expect(xml).toContain(">inbound_q_7</Enqueue>");
    expect(xml).not.toContain("<Queue");
    expect(xml).not.toContain("<Hangup");
    const wait = new URL(attribute(xml, "waitUrl"));
    const complete = new URL(attribute(xml, "action"));
    expect(wait.origin + wait.pathname).toBe("https://base.example/api/acd-router");
    expect([...wait.searchParams]).toEqual([["queue_id", "7"], ["CallSid", callSid], ["From", caller]]);
    expect(complete.origin + complete.pathname).toBe("https://base.example/api/acd-router/complete");
    expect([...complete.searchParams]).toEqual([["queue_name", "inbound_q_7"]]);
    expect(mocks.queue).toHaveBeenCalledWith("w1", 7);
  });

  test("a missing or other-workspace queue hangs up without Enqueue", async () => {
    mocks.queue.mockResolvedValue(null);
    const xml = await (await response(path)).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("<Enqueue");
  });

  test("queue lookup failure does not emit Enqueue", async () => {
    mocks.queue.mockRejectedValue(new Error("Database offline"));
    const xml = await (await response(path)).text();
    expect(xml).not.toContain("<Enqueue");
    expect(xml).not.toContain("Database offline");
  });

  test("invalid queue IDs are rejected before lookup", async () => {
    if (path === "number") mocks.number.mockResolvedValue({ id: 42, workspaceId: "w1", inbound_queue_id: -7 });
    else mocks.blockContext.mockResolvedValue({ number: { workspaceId: "w1", phoneNumber: called }, script: { pages: { p1: { blocks: ["b1"] } }, blocks: { b1: { id: "b1", options: [{ value: "1", next: "queue:7:extra" }] } } } });
    const xml = await (await response(path)).text();
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("<Enqueue");
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  test("signature rejection stops the queue path", async () => {
    const forbidden = new Response("Forbidden", { status: 403 });
    mocks.signature.mockResolvedValue(forbidden);
    mocks.ivrSignature.mockResolvedValue(forbidden);
    expect((await response(path)).status).toBe(403);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
