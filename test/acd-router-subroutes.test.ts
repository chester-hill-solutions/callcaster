import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

// Covers the three acd-router sub-routes that had zero route-level test
// coverage of their auth callback (test/acd-router.test.ts only exercises
// handleAcdRouterRequest directly, not these route files' `action`).
// Regression under test: all three used to build the signature-check option
// as `callSid ? { callSid } : {}` — omitting CallSid silently downgraded
// validation to the main-account token instead of failing. A genuine Twilio
// voice callback to these URLs always carries CallSid.

const mocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(),
  handleAcdRouterRequest: vi.fn(),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) => mocks.requireTwilioSignature(...args),
  twilioWebhookForbiddenHangup: () =>
    new Response("<Response><Say/><Hangup/></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    }),
}));
vi.mock("@/lib/acd/acd-router.server", () => ({
  handleAcdRouterRequest: (...args: unknown[]) => mocks.handleAcdRouterRequest(...args),
}));

function requestWithCallSid(url: string, callSid: string | null) {
  const fd = new FormData();
  if (callSid) fd.set("CallSid", callSid);
  return new Request(url, { method: "POST", body: fd });
}

const routes: Array<{ name: string; path: string; url: string; arg: string }> = [
  {
    name: "agent-status",
    path: "../app/routes/api+/acd-router/agent-status.route",
    url: "http://localhost/api/acd-router/agent-status",
    arg: "agent-status",
  },
  {
    name: "agent-bridge",
    path: "../app/routes/api+/acd-router/agent-bridge.route",
    url: "http://localhost/api/acd-router/agent-bridge",
    arg: "agent-bridge",
  },
  {
    name: "complete",
    path: "../app/routes/api+/acd-router/complete.route",
    url: "http://localhost/api/acd-router/complete",
    arg: "complete",
  },
];

describe.each(routes)("app/routes/api+/acd-router/$name", ({ name, path, url, arg }) => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockResolvedValue(null);
    mocks.handleAcdRouterRequest.mockReset();
    mocks.handleAcdRouterRequest.mockResolvedValue(
      new Response("<Response><Say>ok</Say></Response>", {
        headers: { "Content-Type": "text/xml" },
      }),
    );
  });

  test(`${name}: rejects with 403 hangup when CallSid is missing, without calling requireTwilioSignature`, async () => {
    const mod = await import(path);
    const res = await asRouteResponse(
      mod.action({ request: requestWithCallSid(url, null) } as never),
    );
    expect(res.status).toBe(403);
    expect(mocks.requireTwilioSignature).not.toHaveBeenCalled();
    expect(mocks.handleAcdRouterRequest).not.toHaveBeenCalled();
  });

  test(`${name}: validates against the resolved CallSid and delegates on success`, async () => {
    const mod = await import(path);
    const res = await asRouteResponse(
      mod.action({ request: requestWithCallSid(url, "CA1") } as never),
    );
    expect(mocks.requireTwilioSignature).toHaveBeenCalledWith(
      expect.anything(),
      { callSid: "CA1" },
    );
    expect(mocks.handleAcdRouterRequest).toHaveBeenCalledWith(expect.anything(), arg);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toContain("ok");
  });

  test(`${name}: returns 403 when Twilio signature validation fails`, async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid Twilio signature" }), { status: 403 }),
    );
    const mod = await import(path);
    const res = await asRouteResponse(
      mod.action({ request: requestWithCallSid(url, "CA1") } as never),
    );
    expect(res.status).toBe(403);
    expect(mocks.handleAcdRouterRequest).not.toHaveBeenCalled();
  });
});
