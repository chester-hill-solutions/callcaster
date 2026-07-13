import { describe, expect, test } from "vitest";

import {
  isProductCapabilityId,
  PRODUCT_CAPABILITIES,
} from "../app/lib/capabilities";

describe("capabilities registry", () => {
  test("includes telephony cutover capability IDs", () => {
    expect(PRODUCT_CAPABILITIES["calls.start"]).toBeTruthy();
    expect(PRODUCT_CAPABILITIES["calls.control"]).toBeTruthy();
  });

  test("isProductCapabilityId rejects unknown IDs", () => {
    expect(isProductCapabilityId("calls.start")).toBe(true);
    expect(isProductCapabilityId("not.a.capability")).toBe(false);
  });
});
