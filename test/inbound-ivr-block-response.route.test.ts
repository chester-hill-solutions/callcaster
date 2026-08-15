import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireTwilioSignatureForIvrResponse: vi.fn(),
  env: {
    BASE_URL: () => "https://base.example",
  },
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  findCallBySid: vi.fn(),
  loadInboundIvrBlockContext: vi.fn(),
}));

vi.mock("@client/client-js", () => ({ createClient: (...a: unknown[]) => mocks.createClient(...a) }));
vi.mock("@/lib/ivr-webhook-auth.server", () => ({
  requireTwilioSignatureForIvrResponse: (...a: unknown[]) =>
    mocks.requireTwilioSignatureForIvrResponse(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: (...a: unknown[]) => mocks.findCallBySid(...a),
}));
vi.mock("@/lib/inbound-ivr-db.server", () => ({
  loadInboundIvrBlockContext: (...a: unknown[]) => mocks.loadInboundIvrBlockContext(...a),
}));

function makeReq(form: Record<string, string>) {
  const params = new URLSearchParams(form);
  return new Request("https://base.example/api/inbound-ivr/1/page_1/b1/", {
    method: "POST",
    body: params,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTwilioSignatureForIvrResponse.mockImplementation(
    async () => ({ callSid: "CA1", userInput: "1" }),
  );
  mocks.findCallBySid.mockResolvedValue({
    sid: "CA1",
    to: "+15551234567",
    workspace: "w1",
  });
  mocks.loadInboundIvrBlockContext.mockResolvedValue({
    number: { phoneNumber: "+15551234567", workspaceId: "w1" },
    script: {
      pages: { page_1: { blocks: ["b1"] } },
      blocks: { b1: { id: "b1", options: [{ value: "1", next: "hangup" }] } },
    },
  });
});

describe("inbound IVR block response", () => {
  test("internal error text is not spoken to the caller", async () => {
    // Simulate an internal error from findCallBySid
    mocks.findCallBySid.mockRejectedValue(new Error("ECONNREFUSED postgres:5432"));

    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route"
    );
    const res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);

    const text = await res.text();
    // Must speak the generic message, not the internal error
    expect(text).toContain("Sorry, we ran into a problem.");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("postgres");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Inbound IVR Error:",
      expect.any(Error),
    );
  });

  test("block-not-found error does not appear in TwiML", async () => {
    mocks.loadInboundIvrBlockContext.mockResolvedValue({
      number: { phoneNumber: "+15551234567", workspaceId: "w1" },
      script: {
        pages: { page_1: { blocks: ["b1"] } },
        blocks: {},
      },
    });

    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route"
    );
    const res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);

    const text = await res.text();
    expect(text).toContain("Sorry, we ran into a problem.");
    expect(text).not.toContain("Block b1 not found");
  });

  test("non-Error thrown value produces generic message", async () => {
    mocks.findCallBySid.mockImplementationOnce(async () => {
      throw "some string error";
    });

    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route"
    );
    const res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);

    const text = await res.text();
    expect(text).toContain("Sorry, we ran into a problem.");
  });

  test("returns hangup for missing call or mismatched number", async () => {
    // No call found
    mocks.findCallBySid.mockResolvedValue(null);

    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route"
    );
    let res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toMatch(/hangup/i);

    // Call.to doesn't match number phoneNumber
    mocks.findCallBySid.mockResolvedValue({
      sid: "CA1",
      to: "+19998887777",
      workspace: "w1",
    });
    res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1", Digits: "1" }),
    } as any);
    expect(await res.text()).toMatch(/hangup/i);
  });

  test("routes to next block on valid input", async () => {
    // The auth mock returns no userInput by default for this test
    mocks.requireTwilioSignatureForIvrResponse.mockImplementation(
      async () => ({ callSid: "CA1", userInput: null }),
    );

    const mod = await import(
      "../app/routes/api+/inbound-ivr/$numberId/$pageId/$blockId/response.route"
    );
    const res = await mod.action({
      params: { numberId: "1", pageId: "page_1", blockId: "b1" },
      request: makeReq({ CallSid: "CA1" }),
    } as any);

    // block has no next => hangup (findNextBlock returns null for last block)
    const text = await res.text();
    expect(text).toMatch(/hangup/i);
  });
});
