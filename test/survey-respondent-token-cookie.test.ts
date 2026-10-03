import { beforeEach, describe, expect, test, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createRespondentToken, verifyRespondentToken } from "@/lib/survey-respondent-token.server";
import { readRespondentCookie, serializeRespondentCookie } from "@/lib/survey-respondent-cookie.server";

vi.hoisted(() => { process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret"; });
const request = new Request("https://example.test/survey/public-survey");
const context = { request, surveyId: 1, workspace: "ws-1", contactId: null };
function signPayload(payload: unknown) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const encoded = `${header}.${body}`;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Missing test signing secret");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

describe("signed survey resume cookies", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  test("a secure cookie keeps the exact signed identity and expiry", async () => {
    const identity = await createRespondentToken(1, "ws-1");
    const payload = await verifyRespondentToken(identity.token, 1);
    if (!payload) throw new Error("Issued identity did not verify");
    const cookie = await serializeRespondentCookie({ ...context, token: identity.token });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Expires=${new Date(payload.exp * 1000).toUTCString()}`);
    expect(await readRespondentCookie({ ...context, request: new Request(request.url, { headers: { Cookie: cookie.split(";")[0] } }) })).toEqual(identity);
  });
  test.each(["contact", "survey", "workspace", "expired"])("a %s mismatch cannot resume", async (kind) => {
    const identity = await createRespondentToken(1, "ws-1");
    const cookie = await serializeRespondentCookie({ ...context, token: identity.token });
    if (kind === "expired") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    expect(await readRespondentCookie({ ...context, contactId: kind === "contact" ? 100 : null, surveyId: kind === "survey" ? 2 : 1, workspace: kind === "workspace" ? "other" : "ws-1", request: new Request(request.url, { headers: { Cookie: cookie.split(";")[0] } }) })).toBeNull();
  });
  test.each([undefined, null, "future", 0, NaN])("rejects a correctly signed token with invalid expiry %s", async (exp) => {
    expect(await verifyRespondentToken(signPayload({ survey_id: 1, workspace: "ws-1", result_id: "R1", exp }), 1)).toBeNull();
  });
  test("expiry at the current second is already expired", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyRespondentToken(signPayload({ survey_id: 1, workspace: "ws-1", result_id: "R1", exp: now }), 1)).toBeNull();
  });
  test("normalizes a trusted database bigint ID before signing", async () => {
    const identity = await createRespondentToken("1" as never, "ws-1");
    expect(await verifyRespondentToken(identity.token, "1" as never)).toMatchObject({ survey_id: 1, result_id: identity.resultId });
  });
  test("a nonpositive or unsafe survey identity cannot be issued", async () => {
    await expect(createRespondentToken(0, "ws-1")).rejects.toThrow("Invalid survey identity");
    await expect(createRespondentToken(Number.MAX_SAFE_INTEGER + 1, "ws-1")).rejects.toThrow("Invalid survey identity");
  });
});
