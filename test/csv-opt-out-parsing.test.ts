import { describe, expect, test } from "vitest";

import { parseCSV } from "@/lib/csv-contacts";

/**
 * These standalone parser cases do not prove the server upload path, which uses
 * lib/csv. Its write-boundary coverage is in audience-upload-opt-out.test.ts.
 */

/** Build a one-column CSV so each case names its own value in the failure. */
function optOutFor(value: string): boolean {
  const csv = ["firstname,phone,opt_out", `Test,+15550000,${value}`].join("\n");
  const { contacts } = parseCSV(csv);
  expect(contacts).toHaveLength(1);
  return contacts[0].opt_out;
}

describe("parseCSV opt-out column", () => {
  describe.each([
    // ── opted out ──────────────────────────────────────────────
    ["yes", true],
    ["YES", true],
    ["Yes", true],
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["y", true],
    ["opt-out", true],
    ["opt out", true],
    ["optout", true],
    ["opted-out", true],
    ["opted out", true],
    ["optedout", true],
    ["unsubscribe", true],
    ["UNSUBSCRIBE", true],
    ["unsubscribed", true],
    ["do-not-contact", true],
    ["do not contact", true],
    ["denied", true],
    ["revoked", true],
    ["blocked", true],
    ["suppressed", true],
    // Padded and mixed case, because CSVs are hand-edited.
    ["  Opted Out  ", true],
    ["do   not\tcontact", true],
  ])("%s → opted out", (value, expected) => {
    test(`is ${expected}`, () => {
      expect(optOutFor(value)).toBe(expected);
    });
  });

  describe.each([
    ["no", false],
    ["NO", false],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["n", false],
    ["opted-in", false],
    ["opted in", false],
    ["subscribed", false],
    ["active", false],
    ["pending", false],
    ["  No  ", false],
  ])("%s → opted in", (value, expected) => {
    test(`is ${expected}`, () => {
      expect(optOutFor(value)).toBe(expected);
    });
  });

  describe("blank and absent", () => {
    test("an empty cell is not an opt-out", () => {
      // The file said nothing, which is not the same as the file saying no.
      expect(optOutFor("")).toBe(false);
    });

    test("an absent column is not an opt-out", () => {
      const { contacts } = parseCSV("firstname,phone\nTest,+15550000");
      expect(contacts[0].opt_out).toBe(false);
    });
  });

  describe("unrecognised values fail safe", () => {
    /**
     * The load-bearing assertion.
     *
     * `opted out` parsed to `false` before this change, which made the contact
     * dispatchable — the inverse of what the customer wrote in their file.
     */
    test.each(["maybe", "pending review", "TRUE-ish", "2", "-1", "opted_out", "yep"])(
      "%s is treated as opted out, not contactable",
      (value) => {
        expect(optOutFor(value)).toBe(true);
      },
    );

    test("the fallback is the safe direction for a compliance column", () => {
      // Stated as its own test so the *direction* is pinned independently of any
      // particular spelling: contactable must require an explicit permitted value.
      expect(optOutFor("definitely-not-a-consent-value")).toBe(true);
    });
  });

  describe("never throws", () => {
    test.each(["unsubscribe", "opted out", "", "  ", "😀", "a".repeat(500), "NULL", "undefined"])(
      "%j does not throw",
      (value) => {
        expect(() => optOutFor(value)).not.toThrow();
      },
    );
  });

  /**
   * The full documented header aliases must all resolve to the opt-out column, so
   * a file using any of them reaches the parser at all. Without this the value
   * tests could pass while the column landed in `other_data`.
   */
  describe("header aliases route to the opt-out column", () => {
    /**
     * `shared/contact-import-headers.ts` normalises separators and lists
     * `opt out` / `optout` as recognised opt-out column names. The runtime
     * matcher in `csv-contacts.ts` is a separate regex table, and it rejected
     * the space-separated spelling — so the two modules disagreed and a file
     * using `opt out` had the whole column dropped into `other_data`.
     *
     * `other_data` being empty is the load-bearing half: `opt_out === true` on
     * its own would also hold if the value landed somewhere harmless.
     */
    test.each([
      "opt_out",
      "opt-out",
      "opt out",
      "optout",
      "Opt Out",
      "unsubscribe",
      "do not contact",
      "consent",
      "permission",
      "contact_opt_out",
    ])("%s is recognised as an opt-out column", (header) => {
      const csv = ["firstname,phone," + header, "Test,+15550000,unsubscribe"].join("\n");
      const { contacts } = parseCSV(csv);
      expect(contacts[0].opt_out).toBe(true);
      expect(contacts[0].other_data).toEqual([]);
    });
  });
});