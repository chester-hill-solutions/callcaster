import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { generateToken } from "@/lib/twilio-token.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";

const fixture = vi.hoisted(() => ({
  accountSid: "AC00000000000000000000000000000001",
  keySid: "SK00000000000000000000000000000001",
  applicationSid: "AP00000000000000000000000000000001",
  secret: "local-fixture-signing-secret",
  now: 1791000000,
}));

vi.mock("@/lib/env.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...original,
    env: { ...original.env, TWILIO_APP_SID: () => fixture.applicationSid },
  };
});
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-members-db.server")
  >()),
  getWorkspaceById: async () => ({
    twilio_data: JSON.stringify({ sid: fixture.accountSid }),
    key: fixture.keySid,
    token: fixture.secret,
  }),
}));

// Resolve the SDK's own JWT path so a second root copy cannot hide its dependency.
const rootRequire = createRequire(import.meta.url);
const sdkRequire = createRequire(
  rootRequire.resolve("twilio/lib/jwt/AccessToken.js"),
);
const jwt = sdkRequire("jsonwebtoken");
const jws = createRequire(sdkRequire.resolve("jsonwebtoken"))("jws");
const tokens: Record<string, string> = {};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(fixture.now * 1000);
  try {
    tokens["Node browser"] = await generateToken({
      twilioAccountSid: fixture.accountSid,
      twilioApiKey: fixture.keySid,
      twilioApiSecret: fixture.secret,
      identity: "browser-agent",
    });
    const handset = await createHandsetAccessToken({
      workspaceId: "fixture-workspace",
      clientIdentity: "handset-agent",
    });
    if (handset.error || !handset.token)
      throw new Error(handset.error ?? "Missing token");
    tokens["Node handset"] = handset.token;
  } finally {
    vi.useRealTimers();
  }
  const bun = JSON.parse(
    execFileSync(
      "bun",
      [
        "run",
        "test/fixtures/runtime-twilio-tokens.ts",
        JSON.stringify(fixture),
      ],
      {
        cwd: process.cwd(),
        timeout: 15000,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    ),
  );
  tokens["Bun browser"] = bun.browser;
  tokens["Bun handset"] = bun.handset;
});

afterAll(() => vi.useRealTimers());

for (const runtime of ["Node", "Bun"]) {
  for (const consumer of [
    { name: "browser", identity: "browser-agent", ttl: 28800 },
    { name: "handset", identity: "handset-agent", ttl: 3600 },
  ]) {
    describe(`${runtime} ${consumer.name} real Twilio token`, () => {
      const token = () => tokens[`${runtime} ${consumer.name}`];
      const options = () => ({
        algorithms: ["HS256"],
        issuer: fixture.keySid,
        subject: fixture.accountSid,
        clockTimestamp: fixture.now,
      });

      test("retains the issuer, account, expiry, identity and voice grants", () => {
        const result = jwt.verify(token(), fixture.secret, {
          ...options(),
          complete: true,
        });
        expect(result.header).toMatchObject({
          alg: "HS256",
          typ: "JWT",
          cty: "twilio-fpa;v=1",
        });
        expect(result.payload).toMatchObject({
          iss: fixture.keySid,
          sub: fixture.accountSid,
          iat: fixture.now,
          exp: fixture.now + consumer.ttl,
          grants: {
            identity: consumer.identity,
            voice: {
              incoming: { allow: true },
              outgoing: { application_sid: fixture.applicationSid },
            },
          },
        });
      });

      test("rejects a token verified with another key", () => {
        expect(() =>
          jwt.verify(token(), "another-fixture-secret", options()),
        ).toThrow("invalid signature");
      });

      test("rejects a token under the wrong allowed algorithm", () => {
        expect(() =>
          jwt.verify(token(), fixture.secret, {
            ...options(),
            algorithms: ["HS512"],
          }),
        ).toThrow("invalid algorithm");
      });

      test("rejects altered identity claims without a new signature", () => {
        const parts = token().split(".");
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString(),
        );
        payload.grants.identity = "another-agent";
        parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
        expect(() =>
          jwt.verify(parts.join("."), fixture.secret, options()),
        ).toThrow("invalid signature");
      });

      test("rejects the token at its expiry boundary", () => {
        expect(() =>
          jwt.verify(token(), fixture.secret, {
            ...options(),
            clockTimestamp: fixture.now + consumer.ttl,
          }),
        ).toThrow("jwt expired");
      });
    });
  }
}

describe("SDK-resolved jws package-only HMAC stream contract", () => {
  test("rejects a missing HMAC secret before opening a verification stream", () => {
    const signature = jws.sign({
      header: { alg: "HS256" },
      payload: "fixture",
      secret: fixture.secret,
    });
    expect(() => jws.createVerify({ algorithm: "HS256", signature })).toThrow(
      "secret must be a string or buffer or a KeyObject",
    );
  });

  test("accepts a valid HMAC stream with its supplied secret", async () => {
    const signature = jws.sign({
      header: { alg: "HS256" },
      payload: "fixture",
      secret: fixture.secret,
    });
    const stream = jws.createVerify({
      algorithm: "HS256",
      signature,
      secret: fixture.secret,
    });
    const [valid, decoded] = await once(stream, "done", {
      signal: AbortSignal.timeout(3000),
    });
    expect(valid).toBe(true);
    expect(decoded.payload).toBe("fixture");
  });
});
