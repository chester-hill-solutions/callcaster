import { beforeEach, describe, expect, test, vi } from "vitest";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";

const fixtures = vi.hoisted(() => ({
  credentials: { sid: "AC_query_fixture", authToken: "workspace-query-token" } as
    | { sid: string; authToken: string }
    | null,
  callFound: true,
  loadWorkspace: vi.fn(),
  resolveAccount: vi.fn(),
}));

vi.mock("@/lib/env.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...original,
    env: {
      ...original.env,
      BASE_URL: () => "https://callbacks.example",
      TWILIO_VALIDATE_WEBHOOKS: () => "true",
      TWILIO_AUTH_TOKEN: () => "main-query-token",
    },
  };
});

vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  findCallBySid: vi.fn(async () => fixtures.callFound ? { workspace: "query-workspace" } : null),
}));

vi.mock("@/lib/merge-workspace-twilio-data.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/merge-workspace-twilio-data.server")>()),
  loadWorkspaceTwilioData: (...args: unknown[]) => fixtures.loadWorkspace(...args),
  findWorkspaceIdByTwilioAccountSid: (...args: unknown[]) => fixtures.resolveAccount(...args),
}));

import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { logger } from "@/lib/logger.server";
import { handleTwilioWebhookRequest } from "../server/twilio-webhook";

const PATH = "/api/auto-dial/status";
const QUERY = "?audio=welcome%20%26%20thanks.mp3&tag=a&tag=b&empty=";
const PARAMS = { CallSid: "CA_query_fixture", AccountSid: "AC_query_fixture", CallStatus: "ringing" };

function signedRequest(options: {
  method?: "POST" | "GET" | "HEAD";
  query?: string;
  signedQuery?: string;
  signingToken?: string;
  unsigned?: boolean;
  body?: Record<string, string>;
} = {}): Request {
  const method = options.method ?? "POST";
  const query = options.query ?? QUERY;
  const signature = getExpectedTwilioSignature(
    options.signingToken ?? "workspace-query-token",
    `https://callbacks.example${PATH}${options.signedQuery ?? query}`,
    method === "POST" ? PARAMS : {},
  );
  return new Request(`http://internal.example:3000${PATH}${query}`, {
    method,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Forwarded-Host": "attacker.example",
      "X-Forwarded-Proto": "http",
      ...(options.unsigned ? {} : { "X-Twilio-Signature": signature }),
    },
    ...(method === "POST" ? { body: new URLSearchParams(options.body ?? PARAMS).toString() } : {}),
  });
}

async function validate(request: Request, boundary: "route" | "ingress") {
  if (boundary === "route") {
    return await requireTwilioSignature(request, { callSid: "CA_query_fixture" });
  }
  const result = await handleTwilioWebhookRequest(request);
  if (result.kind === "response") return result.response;
  expect(result.kind).toBe("validated");
  if (result.kind === "validated") {
    expect(result.request.url).toBe(request.url);
    expect(result.request.method).toBe(request.method);
    if (request.method === "POST") {
      expect(Object.fromEntries(await result.request.formData())).toEqual(PARAMS);
    }
  }
  return null;
}

beforeEach(() => {
  fixtures.credentials = { sid: "AC_query_fixture", authToken: "workspace-query-token" };
  fixtures.callFound = true;
  fixtures.loadWorkspace.mockReset().mockImplementation(async () => fixtures.credentials);
  fixtures.resolveAccount.mockReset().mockResolvedValue("query-workspace");
});

for (const boundary of ["route", "ingress"] as const) {
  describe(`${boundary} complete Twilio URL validation`, () => {
    test("accepts a real SDK POST signature with encoded, repeated and empty query values", async () => {
      expect(await validate(signedRequest(), boundary)).toBeNull();
      expect(fixtures.loadWorkspace).toHaveBeenCalledWith("query-workspace");
    });

    test("keeps no-query POST callbacks compatible", async () => {
      expect(await validate(signedRequest({ query: "" }), boundary)).toBeNull();
    });

    test("retains the SDK's compatibility for equivalent space encoding", async () => {
      expect(await validate(signedRequest({ query: QUERY.replace("%20", "+"), signedQuery: QUERY }), boundary)).toBeNull();
    });

    test.each(["GET", "HEAD"] as const)("accepts %s without counting its query fields twice", async (method) => {
      fixtures.callFound = false;
      const query = `${QUERY}&CallSid=CA_query_fixture&AccountSid=AC_query_fixture`;
      expect(await validate(signedRequest({ method, query }), boundary)).toBeNull();
      expect(fixtures.resolveAccount).toHaveBeenCalledWith("AC_query_fixture");
    });

    test.each([
      { title: "changed value", query: QUERY.replace("thanks", "goodbye") },
      { title: "added value", query: `${QUERY}&new=1` },
      { title: "removed query", query: "" },
      { title: "reordered duplicates", query: QUERY.replace("tag=a&tag=b", "tag=b&tag=a") },
    ])("rejects $title with the original signature", async ({ query }) => {
      const denied = await validate(signedRequest({ query, signedQuery: QUERY }), boundary);
      expect(denied?.status).toBe(403);
    });

    test("rejects a query-free signature replayed with an appended choice", async () => {
      const denied = await validate(signedRequest({ signedQuery: "" }), boundary);
      expect(denied?.status).toBe(403);
    });

    test("rejects tampered POST fields", async () => {
      const denied = await validate(signedRequest({ body: { ...PARAMS, CallStatus: "completed" } }), boundary);
      expect(denied?.status).toBe(403);
    });

    test("rejects the main-account token for a workspace callback", async () => {
      const denied = await validate(signedRequest({ signingToken: "main-query-token" }), boundary);
      expect(denied?.status).toBe(403);
    });

    test("rejects a missing signature", async () => {
      const denied = await validate(signedRequest({ unsigned: true }), boundary);
      expect(denied?.status).toBe(403);
    });

    test("fails closed when workspace credentials are missing", async () => {
      fixtures.credentials = null;
      const denied = await validate(signedRequest(), boundary);
      expect(denied?.status).toBe(403);
    });

    test.each(["invalid signature", "missing signature", "missing credentials"])("keeps query values out of $0 logs", async (failure) => {
      vi.mocked(logger.warn).mockClear();
      if (failure === "missing credentials") fixtures.credentials = null;
      const denied = await validate(signedRequest({
        query: "?token=never-log-query",
        signingToken: failure === "invalid signature" ? "wrong-token" : undefined,
        unsigned: failure === "missing signature",
      }), boundary);
      expect(denied?.status).toBe(403);
      expect(logger.warn).toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("never-log-query");
    });
  });
}
