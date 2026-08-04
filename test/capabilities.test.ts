import { describe, expect, test } from "vitest";
import { PRODUCT_ROLE_IDS as CHS_PRODUCT_ROLE_IDS } from "@chester-hill-solutions/auth-postgres";

import {
  capabilityIdsForRole,
  isProductCapabilityId,
  PRODUCT_CAPABILITIES,
  PRODUCT_ROLE_IDS,
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

  test("local PRODUCT_ROLE_IDS matches CHS auth-postgres", () => {
    expect([...PRODUCT_ROLE_IDS]).toEqual([...CHS_PRODUCT_ROLE_IDS]);
  });

  test("capabilityIdsForRole is deny-by-default for unknown roles", () => {
    expect(capabilityIdsForRole("invited")).toEqual([]);
  });
});
