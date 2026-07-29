import { describe, expect, test } from "vitest";

import { completeOpenApiSpec } from "../app/lib/openapi-complete";

describe("complete openapi json export contract", () => {
  test("path count matches documentable inventory scale", () => {
    const pathCount = Object.keys(completeOpenApiSpec.paths).length;
    expect(pathCount).toBeGreaterThan(50);
    expect(pathCount).toBeLessThan(200);
  });

  test("includes provider webhook and user tags", () => {
    const tags = completeOpenApiSpec.tags.map((t) => t.name);
    expect(tags).toContain("Provider Webhook");
    expect(tags).toContain("User API");
  });

  test("has no Security Gap surfaces (weakUnknown authClass is banned)", () => {
    // The last weakUnknown entry (dial/:number) was fixed 2026-07-29; this
    // locks the inventory in the gap-free state — a reappearing tag means a
    // new route shipped with weak/unknown auth.
    const tags = completeOpenApiSpec.tags.map((t) => t.name);
    expect(tags).not.toContain("Security Gap");
  });
});
