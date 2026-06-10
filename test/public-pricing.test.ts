import { describe, expect, test } from "vitest";

import { buildPublicPricingRows } from "../app/lib/public-pricing";

describe("public-pricing", () => {
  test("buildPublicPricingRows uses Option B credit peg", () => {
    const rows = buildPublicPricingRows();
    expect(rows.some((row) => row.service === "Credits")).toBe(true);
    expect(rows.some((row) => row.rates.some((rate) => rate.price.includes("$0.02")))).toBe(
      true,
    );
    expect(rows.some((row) => row.service === "Texting")).toBe(true);
    expect(rows.some((row) => row.service === "Phone numbers")).toBe(true);
  });
});
