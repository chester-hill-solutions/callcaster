import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireBlock: vi.fn(),
  env: { BASE_URL: () => "https://base.example" },
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  findCallBySid: vi.fn(),
  loadInboundIvrBlockContext: vi.fn(),
  createSignedObjectUrl: vi.fn(),
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
      '<Gather action="https://base.example/api/inbound-ivr/1/page_1/b1/response" input="dtmf" timeout="5"><Play>https://signed</Play></Gather>',
    );
    expect(xml).toContain(
      "<Redirect>https://base.example/api/inbound-ivr/1/page_1/b1/response</Redirect>",
    );
  });
});
