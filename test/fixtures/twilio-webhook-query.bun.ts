import { strict as assert } from "node:assert";
import { mock } from "bun:test";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";

process.env.DATABASE_URL = "postgres://fixture:fixture@127.0.0.1:1/fixture";
process.env.BASE_URL = "https://callbacks.example";
process.env.NODE_ENV = "test";
process.env.TWILIO_VALIDATE_WEBHOOKS = "true";

const telephony = await import("../../app/lib/telephony-db.server.ts");
mock.module("../../app/lib/telephony-db.server.ts", () => ({
  ...telephony,
  findCallBySid: async () => null,
}));
const workspace = await import("../../app/lib/merge-workspace-twilio-data.server.ts");
mock.module("../../app/lib/merge-workspace-twilio-data.server.ts", () => ({
  ...workspace,
  findWorkspaceIdByTwilioAccountSid: async (sid: string) => sid === "AC_bun_query" ? "bun-workspace" : null,
  loadWorkspaceTwilioData: async () => ({ sid: "AC_bun_query", authToken: "bun-query-token" }),
}));

const { requireTwilioSignature } = await import("../../app/lib/twilio-webhook.server.ts");
const { handleTwilioWebhookRequest } = await import("../../server/twilio-webhook.ts");
const path = "/api/call-status";
const params = { CallSid: "CA_bun_query", AccountSid: "AC_bun_query", CallStatus: "ringing" };
const query = "?audio=hello%20%26%20thanks.mp3&tag=a&tag=b&empty=";
let executed = 0;

for (const boundary of ["route", "ingress"]) {
  for (const entry of [
    { method: "POST", query, signedQuery: query, expected: null },
    { method: "POST", query: "", signedQuery: "", expected: null },
    { method: "GET", query: `${query}&CallSid=CA_bun_query&AccountSid=AC_bun_query`, expected: null },
    { method: "HEAD", query: `${query}&CallSid=CA_bun_query&AccountSid=AC_bun_query`, expected: null },
    { method: "POST", query: query.replace("thanks", "changed"), signedQuery: query, expected: 403 },
    { method: "POST", query, signedQuery: "", expected: 403 },
  ]) {
    const signature = getExpectedTwilioSignature(
      "bun-query-token",
      `https://callbacks.example${path}${entry.signedQuery ?? entry.query}`,
      entry.method === "POST" ? params : {},
    );
    const request = new Request(`http://internal.example:3000${path}${entry.query}`, {
      method: entry.method,
      headers: { "X-Twilio-Signature": signature, "Content-Type": "application/x-www-form-urlencoded" },
      ...(entry.method === "POST" ? { body: new URLSearchParams(params).toString() } : {}),
    });
    let status: number | null;
    if (boundary === "route") {
      status = (await requireTwilioSignature(request, { callSid: "CA_bun_query" }))?.status ?? null;
    } else {
      const result = await handleTwilioWebhookRequest(request);
      assert.notEqual(result.kind, "continue");
      status = result.kind === "response" ? result.response.status : null;
      if (result.kind === "validated") {
        assert.equal(result.request.url, request.url);
        if (entry.method === "POST") {
          assert.deepEqual(Object.fromEntries(await result.request.formData()), params);
        }
      }
    }
    assert.equal(status, entry.expected, `${boundary} ${entry.method} ${entry.query}`);
    executed++;
  }
}
console.log(JSON.stringify({ executed, failed: 0 }));
