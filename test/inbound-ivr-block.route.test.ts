import { readFileSync, readdirSync } from "node:fs";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireBlock: vi.fn(),
  env: { BASE_URL: () => "https://base.example" },
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  findCallBySid: vi.fn(),
  loadInboundIvrBlockContext: vi.fn(),
  createSignedObjectUrl: vi.fn(),
  objectExists: vi.fn(),
}));

vi.mock("@client/client-js", () => ({
  createClient: (...a: unknown[]) => mocks.createClient(...a),
}));
vi.mock("@/lib/ivr-webhook-auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ivr-webhook-auth.server")>()),
  requireTwilioSignatureForIvrBlock: (...a: unknown[]) => mocks.requireBlock(...a),
}));
vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: mocks.env,
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  findCallBySid: (...a: unknown[]) => mocks.findCallBySid(...a),
}));
vi.mock("@/lib/inbound-ivr-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-ivr-db.server")>()),
  loadInboundIvrBlockContext: (...a: unknown[]) =>
    mocks.loadInboundIvrBlockContext(...a),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrl: (...a: unknown[]) => mocks.createSignedObjectUrl(...a),
  objectExists: (...a: unknown[]) => mocks.objectExists(...a),
}));

function makeReq() {
  return new Request("https://base.example/api/inbound-ivr/1/page_1/b1/", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireBlock.mockResolvedValue({ callSid: "CA1" });
  mocks.createSignedObjectUrl.mockResolvedValue("https://signed");
  mocks.objectExists.mockReset().mockResolvedValue(false);
  mocks.findCallBySid.mockResolvedValue({
    sid: "CA1",
    to: "+15551234567",
    workspace: "w1",
  });
  mocks.loadInboundIvrBlockContext.mockResolvedValue({
    number: { phoneNumber: "+15551234567", workspaceId: "w1" },
    script: {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: {
        b1: {
          id: "b1",
          type: "recorded",
          audioFile: "a.mp3",
          options: [{ value: "1", next: "hangup" }],
        },
      },
    },
  });
});

describe("inbound IVR block", () => {
  test("nests the prompt inside <Gather> so a key press interrupts it (#1841)", async () => {
    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.route"
    );
    const res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq(),
    } as any);
    const xml = await res.text();
    expect(xml).toContain(
      '<Gather action="https://base.example/api/inbound-ivr/1/page_1/b1/response" input="dtmf" numDigits="1" timeout="5"><Play>https://signed</Play></Gather>',
    );
    expect(xml).toContain(
      "<Redirect>https://base.example/api/inbound-ivr/1/page_1/b1/response</Redirect>",
    );
  });
});


async function renderInbound(params = { numberId: "1", pageId: "page_1", blockId: "b1" }) {
  const { action } = await import("../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId.route");
  const request = makeReq();
  return asRouteResponse(action({ request, url: new URL(request.url), params, context: new RouterContextProvider() }));
}

function speechScript(block: Record<string, unknown>) {
  return { pages: { page_1: { blocks: ["b1"] } }, blocks: { b1: { id: "b1", type: "synthetic", audioFile: "", ...block } } };
}

function withScript(script: unknown) {
  mocks.loadInboundIvrBlockContext.mockResolvedValue({
    number: { phoneNumber: "+15551234567", workspaceId: "w1" }, script,
  });
}

describe("inbound uses canonical prompt rendering (#2148)", () => {
  test.each([
    { blockId: "block_1", pageId: "page_1", words: "Hello, my name is [Agent Name]. I'm calling from [Company]." },
    { blockId: "block_2", pageId: "page_1", words: "Is this a good time to talk?" },
    { blockId: "block_3", pageId: "page_2", words: "Great! Let me tell you about our offer." },
    { blockId: "block_4", pageId: "page_2", words: "No problem, thanks for your time." },
  ])("speaks documented content on $blockId", async ({ blockId, pageId, words }) => {
    withScript(JSON.parse(readFileSync(new URL("./fixtures/script-wire/documented-format.json", import.meta.url), "utf8")));
    const xml = await (await renderInbound({ numberId: "1", pageId, blockId })).text();
    expect(xml).toContain(words);
    expect(xml).not.toContain("<Say/>");
    expect(xml).not.toContain("<Say></Say>");
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });

  test("keeps editor speech and its selected allowed voice", async () => {
    withScript(speechScript({ audioFile: "Editor words", content: "Old content", wireExtras: { voice: "Polly.Matthew-Neural" } }));
    const xml = await (await renderInbound()).text();
    expect(xml).toContain('<Say voice="Polly.Matthew-Neural">Editor words</Say>');
    expect(xml).not.toContain("Old content");
    expect(xml).toContain("<Hangup/>");
  });

  test("uses the recorded MP3 when no sidecar exists", async () => {
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Play>https://signed</Play>");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith("workspaceAudio", "w1/a.mp3", 3600);
  });

  test("signs the existing WAV sidecar in the number's workspace", async () => {
    mocks.objectExists.mockResolvedValue(true);
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Play>https://signed</Play>");
    expect(mocks.objectExists).toHaveBeenCalledWith("workspaceAudio", "ivr-wav/w1/a.wav");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith("workspaceAudio", "ivr-wav/w1/a.wav", 3600);
  });

  test("a failed sidecar lookup still plays the canonical MP3", async () => {
    mocks.objectExists.mockRejectedValue(new Error("Synthetic object lookup failure"));
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Play>https://signed</Play>");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith("workspaceAudio", "w1/a.mp3", 3600);
  });

  test("an uploaded WAV plays directly without a sidecar lookup", async () => {
    withScript(speechScript({ type: "recorded", audioFile: "prompt.WAV" }));
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Play>https://signed</Play>");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith("workspaceAudio", "w1/prompt.WAV", 3600);
    expect(mocks.objectExists).not.toHaveBeenCalled();
  });

  test("content speech stays inside the inbound Gather with its response URL", async () => {
    withScript(speechScript({ content: "Press one", options: [{ value: "1", next: "hangup" }] }));
    const xml = await (await renderInbound()).text();
    expect(xml).toContain('<Gather action="https://base.example/api/inbound-ivr/1/page_1/b1/response" input="dtmf" numDigits="1" timeout="5"><Say voice="Polly.Salli-Neural">Press one</Say></Gather>');
    expect(xml).toContain("<Redirect>https://base.example/api/inbound-ivr/1/page_1/b1/response</Redirect>");
  });

  test("ungathered speech redirects to the next inbound block", async () => {
    const script = speechScript({ content: "Continue" });
    script.pages.page_1.blocks.push("b2");
    withScript(script);
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("Continue</Say>");
    expect(xml).toContain("<Redirect>https://base.example/api/inbound-ivr/1/page_1/b2</Redirect>");
  });

  test("signature rejection stops before context and audio access", async () => {
    mocks.requireBlock.mockResolvedValue(new Response("Invalid signature", { status: 403 }));
    const response = await renderInbound();
    expect(response.status).toBe(403);
    expect(mocks.findCallBySid).not.toHaveBeenCalled();
    expect(mocks.loadInboundIvrBlockContext).not.toHaveBeenCalled();
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });

  test("a different called number cannot play this number's script", async () => {
    mocks.findCallBySid.mockResolvedValue({ sid: "CA1", to: "+15559999999", workspace: "w1" });
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("<Play>");
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });

  test("an unattached or foreign script context cannot play", async () => {
    mocks.loadInboundIvrBlockContext.mockResolvedValue(null);
    const xml = await (await renderInbound()).text();
    expect(xml).toContain("<Hangup/>");
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });

  test("a block outside the requested page cannot play", async () => {
    const xml = await (await renderInbound({ numberId: "1", pageId: "other", blockId: "b1" })).text();
    expect(xml).toContain("There was an error in the IVR flow. Goodbye.");
    expect(xml).toContain("<Hangup/>");
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });
});


function routeSources(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? routeSources(url)
      : /\.[jt]sx?$/.test(entry.name) ? [readFileSync(url, "utf8")] : [];
  });
}

test("IVR routes cannot add a second prompt renderer (#2148)", () => {
  const sources = ["ivr", "inbound-ivr"].flatMap((family) =>
    routeSources(new URL(`../app/routes/api+/${family}/`, import.meta.url)),
  );
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) expect(source).not.toMatch(/\brenderAudio\s*:/);
});
