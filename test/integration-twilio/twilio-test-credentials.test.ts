import twilio from "twilio";
import { describe, expect, test } from "vitest";

import { presentTwilioError } from "@/lib/twilio-errors";
import { TWILIO_REQUEST_TIMEOUT_MS } from "@/lib/twilio-client-options";
import {
  isRetryableSmsTwilioError,
  isRetryableVoiceTwilioError,
} from "../../shared/twilio-retry-predicates";

/**
 * Twilio Test Credentials (Console → Account → API keys & tokens → Test
 * credentials) plus the documented magic numbers. Every request below is
 * free and never reaches a carrier; the point is to pin, against Twilio
 * itself, the request shape the app sends and the codes it must classify.
 */
const accountSid = process.env.TWILIO_TEST_ACCOUNT_SID ?? "";
const authToken = process.env.TWILIO_TEST_AUTH_TOKEN ?? "";
const hasTestCredentials = accountSid.startsWith("AC") && authToken.length > 0;

/** Magic senders and recipients from Twilio's test-credential reference. */
const MAGIC = {
  validFrom: "+15005550006",
  invalidFrom: "+15005550001",
  notOwnedFrom: "+15005550007",
  smsQueueFullFrom: "+15005550008",
  invalidTo: "+15005550001",
  unroutableTo: "+15005550002",
  blockedTo: "+15005550004",
  smsIncapableTo: "+15005550009",
} as const;

/** Any well-formed destination works with a valid magic sender. */
const REAL_LOOKING_TO = "+14155552671";

type TwilioRestError = { code?: number; status?: number; message: string };

async function expectTwilioError(run: () => Promise<unknown>): Promise<TwilioRestError> {
  try {
    await run();
  } catch (error) {
    return error as TwilioRestError;
  }
  throw new Error("expected Twilio to reject the request");
}

describe.skipIf(!hasTestCredentials)("Twilio test credentials: message API contract", () => {
  const client = twilio(accountSid, authToken, { timeout: TWILIO_REQUEST_TIMEOUT_MS });

  test("a valid sender queues a message and returns an SM sid", async () => {
    const message = await client.messages.create({
      from: MAGIC.validFrom,
      to: REAL_LOOKING_TO,
      body: "CallCaster contract test",
    });
    expect(message.sid).toMatch(/^SM[0-9a-f]{32}$/);
    expect(message.status).toBe("queued");
    expect(message.from).toBe(MAGIC.validFrom);
    expect(message.to).toBe(REAL_LOOKING_TO);
  });

  test.each([
    ["invalid sender", { from: MAGIC.invalidFrom, to: REAL_LOOKING_TO }, 21212],
    ["sender not owned by the account", { from: MAGIC.notOwnedFrom, to: REAL_LOOKING_TO }, 21606],
    ["sender whose SMS queue is full", { from: MAGIC.smsQueueFullFrom, to: REAL_LOOKING_TO }, 21611],
    ["invalid recipient", { from: MAGIC.validFrom, to: MAGIC.invalidTo }, 21211],
    ["unroutable recipient", { from: MAGIC.validFrom, to: MAGIC.unroutableTo }, 21612],
    ["blocked recipient", { from: MAGIC.validFrom, to: MAGIC.blockedTo }, 21610],
    ["recipient that cannot receive SMS", { from: MAGIC.validFrom, to: MAGIC.smsIncapableTo }, 21614],
  ])("%s is rejected with code %i and classified as not retryable", async (_label, params, code) => {
    const error = await expectTwilioError(() =>
      client.messages.create({ ...params, body: "CallCaster contract test" }),
    );
    expect(error.code).toBe(code);
    expect(error.status).toBe(400);
    expect(isRetryableSmsTwilioError(error)).toBe(false);
    const presented = presentTwilioError(error);
    expect(presented.twilioCode).toBe(code);
    expect(presented.retryable).toBe(false);
    expect(presented.userMessage.length).toBeGreaterThan(0);
  });

  test("a sender the account does not own maps to the Messaging Service guidance", async () => {
    const error = await expectTwilioError(() =>
      client.messages.create({ from: MAGIC.notOwnedFrom, to: REAL_LOOKING_TO, body: "x" }),
    );
    expect(presentTwilioError(error).suggestedAction).toMatch(/Messaging Service/);
  });
});

describe.skipIf(!hasTestCredentials)("Twilio test credentials: call API contract", () => {
  const client = twilio(accountSid, authToken, { timeout: TWILIO_REQUEST_TIMEOUT_MS });
  const url = "https://example.com/callcaster/contract-test.xml";

  test("a valid caller id creates a call and returns a CA sid", async () => {
    const call = await client.calls.create({ from: MAGIC.validFrom, to: REAL_LOOKING_TO, url });
    expect(call.sid).toMatch(/^CA[0-9a-f]{32}$/);
    expect(call.status).toBe("queued");
    expect(call.direction).toBe("outbound-api");
  });

  test.each([
    ["invalid caller id", { from: MAGIC.invalidFrom, to: REAL_LOOKING_TO }, 21212],
    ["caller id not owned by the account", { from: MAGIC.notOwnedFrom, to: REAL_LOOKING_TO }, 21210],
    ["invalid recipient", { from: MAGIC.validFrom, to: MAGIC.invalidTo }, 21217],
    ["unroutable recipient", { from: MAGIC.validFrom, to: MAGIC.unroutableTo }, 21214],
    ["blocked recipient", { from: MAGIC.validFrom, to: MAGIC.blockedTo }, 21216],
  ])("%s is rejected with code %i and classified as not retryable", async (_label, params, code) => {
    const error = await expectTwilioError(() => client.calls.create({ ...params, url }));
    expect(error.code).toBe(code);
    expect(error.status).toBe(400);
    expect(isRetryableVoiceTwilioError(error)).toBe(false);
    expect(presentTwilioError(error).twilioCode).toBe(code);
  });
});

describe("Twilio test credentials: environment gate", () => {
  test("the tier reports why it is skipped when credentials are absent", () => {
    if (hasTestCredentials) return;
    expect(accountSid).toBe("");
  });
});
