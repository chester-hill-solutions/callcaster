import { describe, expect, test } from "vitest";

import {
  buildPublicPricingContent,
  buildPublicPricingRows,
} from "../app/lib/public-pricing";
import {
  formatCreditLabel,
  voiceCreditsFromDurationSeconds,
} from "../shared/pricing";

describe("public-pricing", () => {
  test("buildPublicPricingRows still exposes the full flat list for legacy callers", () => {
    const rows = buildPublicPricingRows();
    expect(rows.some((row) => row.service === "Credits")).toBe(true);
    expect(
      rows.some((row) =>
        row.rates.some((rate) => rate.price.includes("$0.02")),
      ),
    ).toBe(true);
    expect(rows.some((row) => row.service === "Texting")).toBe(true);
    expect(rows.some((row) => row.service === "Phone numbers")).toBe(true);
  });

  test("buildPublicPricingContent lays out three service cards for the pricing page (#1392)", () => {
    // Sai's first checklist point: "should be 3 cards in a row … for texting,
    // calling, IVRs". The content shape is what the pricing route grids over.
    const { services } = buildPublicPricingContent();
    expect(services.map((row) => row.service)).toEqual([
      "Texting",
      "Calling",
      "IVRs",
    ]);
  });

  test("service rates are quoted in credits, not CAD (#1392)", () => {
    // "all units should be in credits except for the price of credits
    // themselves." The service cards must not carry a $ price.
    const { services } = buildPublicPricingContent();
    for (const row of services) {
      for (const rate of row.rates) {
        expect(rate.price).not.toMatch(/\$/);
        expect(rate.price).toMatch(/\bcredits?\b/);
      }
    }
  });

  test("calls placed by the CallCaster team retain a separate quote request (#1392)", () => {
    const { services, account, staffedCallout } = buildPublicPricingContent();
    for (const bucket of [services, account]) {
      for (const row of bucket) {
        expect(row.service.toLowerCase()).not.toContain("staffed");
      }
    }
    expect(staffedCallout.heading).toBe("Calls placed by our team");
    expect(staffedCallout.contactEmail).toMatch(/@/);
    expect(staffedCallout.body).toMatch(/CallCaster team/);
    expect(staffedCallout.body).toMatch(/quoted per project/);
  });

  test.each([
    { service: "Calling", kind: "staffed", first: 4, additional: 5 },
    { service: "IVRs", kind: "ivr", first: 2, additional: 3 },
  ] as const)(
    "$service publishes its own billing rate",
    ({ service, kind, first, additional }) => {
      const row = buildPublicPricingContent().services.find(
        (entry) => entry.service === service,
      );
      if (!row) throw new Error(`Missing ${service} rate card`);
      expect(row.rates.map((rate) => rate.price)).toEqual([
        `${first} credits / dial`,
        `${additional} credits / minute`,
      ]);
      expect(row.rates[0].description).toMatch(/billable/);
      expect(row.rates[1].description).toMatch(/additional started minute/);
      for (const seconds of [1, 60, 61, 300]) {
        const publishedFirst = Number.parseInt(row.rates[0].price, 10);
        const publishedAdditional = Number.parseInt(row.rates[1].price, 10);
        const publishedCredits =
          publishedFirst + (Math.ceil(seconds / 60) - 1) * publishedAdditional;
        expect(publishedCredits).toBe(
          voiceCreditsFromDurationSeconds(seconds, kind),
        );
      }
      expect(voiceCreditsFromDurationSeconds(300, kind)).toBe(
        kind === "staffed" ? 24 : 14,
      );
    },
  );

  test("credits card still prices in CAD (that IS the price-of-credits row itself)", () => {
    const { account } = buildPublicPricingContent();
    const credits = account.find((row) => row.service === "Credits");
    expect(credits).toBeTruthy();
    expect(credits?.rates[0]?.price).toMatch(/\$/);
  });

  test("formatCreditLabel picks the right noun form", () => {
    expect(formatCreditLabel(1)).toBe("1 credit");
    expect(formatCreditLabel(2)).toBe("2 credits");
    expect(formatCreditLabel(0)).toBe("0 credits");
    expect(formatCreditLabel(100)).toBe("100 credits");
    expect(formatCreditLabel(1.25)).toBe("1.25 credits");
  });
});
