import { beforeEach, describe, expect, test } from "vitest";

import {
  createSurveyContactProof,
  verifySurveyContactProof,
} from "@/lib/survey-contact-proof.server";

/**
 * The per-contact link proof for #2868.
 *
 * A `?contact=<id>` is a bare integer, so it proves nothing on its own. The
 * survey loader may only treat a contact id as proof of ownership of a response
 * row when the link also carries this signature, which is what stops one
 * respondent reading or overwriting another respondent's answers.
 */
describe("survey contact proof", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-survey-proof-secret";
  });

  test("a proof verifies for the survey and contact it was minted for", async () => {
    const proof = await createSurveyContactProof(42, 1234);
    expect(await verifySurveyContactProof(42, 1234, proof)).toBe(true);
  });

  test("a proof for one contact does not verify for another", async () => {
    const proof = await createSurveyContactProof(42, 1234);
    expect(await verifySurveyContactProof(42, 5678, proof)).toBe(false);
  });

  test("a proof for one survey does not verify for another", async () => {
    const proof = await createSurveyContactProof(42, 1234);
    expect(await verifySurveyContactProof(43, 1234, proof)).toBe(false);
  });

  test("a proof minted with a different secret does not verify", async () => {
    const proof = await createSurveyContactProof(42, 1234);
    process.env.BETTER_AUTH_SECRET = "a-different-secret";
    expect(await verifySurveyContactProof(42, 1234, proof)).toBe(false);
  });

  test("a tampered signature does not verify", async () => {
    const proof = await createSurveyContactProof(42, 1234);
    const [exp, signature] = proof.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(await verifySurveyContactProof(42, 1234, `${exp}.${flipped}`)).toBe(false);
  });

  test("a proof whose expiry was moved out does not verify", async () => {
    // The signed message covers the expiry, so extending it breaks the
    // signature rather than the deadline.
    const proof = await createSurveyContactProof(42, 1234);
    const [, signature] = proof.split(".");
    const later = Math.floor(Date.now() / 1000) + 60 * 60;
    expect(await verifySurveyContactProof(42, 1234, `${later}.${signature}`)).toBe(false);
  });

  test("an expired proof does not verify", async () => {
    const proof = await createSurveyContactProof(42, 1234, {
      expiresAtSeconds: Math.floor(Date.now() / 1000) - 1,
    });
    expect(await verifySurveyContactProof(42, 1234, proof)).toBe(false);
  });

  test("malformed input is false rather than a throw", async () => {
    for (const bad of [null, undefined, "", ".", "not-a-proof", "abc.def", "123"]) {
      await expect(verifySurveyContactProof(42, 1234, bad)).resolves.toBe(false);
    }
    // A non-positive or non-integer contact/survey cannot be proven either.
    const proof = await createSurveyContactProof(42, 1234);
    expect(await verifySurveyContactProof(42, 0, proof)).toBe(false);
    expect(await verifySurveyContactProof(0, 1234, proof)).toBe(false);
  });

  test("a proof is URL-safe and carries no colon", async () => {
    // It rides inside the `q` payload, which is split on `:`.
    const proof = await createSurveyContactProof(42, 1234);
    expect(proof).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/);
    expect(proof).not.toContain(":");
  });

  test("minting refuses a non-positive survey or contact", async () => {
    await expect(createSurveyContactProof(0, 1)).rejects.toThrow("Invalid survey identity");
    await expect(createSurveyContactProof(1, 0)).rejects.toThrow("Invalid contact identity");
    await expect(createSurveyContactProof(1, -5)).rejects.toThrow("Invalid contact identity");
  });
});
