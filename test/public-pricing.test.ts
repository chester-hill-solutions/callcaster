import { describe, expect, test } from "vitest";

import {
  buildPublicPricingContent,
  buildPublicPricingRows,
} from "../app/lib/public-pricing";
import { formatCreditLabel } from "../shared/pricing";

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

  test("staffed live calls no longer expose a rate — they route to a reach-out prompt (#1392)", () => {
    // "Don't include pricing for staffed calls, make it prompt you to reach
    // out." The service list must not carry a staffed card, and the callout
    // block ships a contact email instead.
    const { services, account, staffedCallout } = buildPublicPricingContent();
    for (const bucket of [services, account]) {
      for (const row of bucket) {
        expect(row.service.toLowerCase()).not.toContain("staffed");
      }
    }
    expect(staffedCallout.heading).toMatch(/staffed/i);
    expect(staffedCallout.contactEmail).toMatch(/@/);
    expect(staffedCallout.body.length).toBeGreaterThan(0);
  });

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
