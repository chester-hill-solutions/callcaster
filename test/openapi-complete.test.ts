import { describe, expect, test } from "vitest";

import { completeOpenApiSpec } from "../app/lib/openapi-complete";

describe("complete openapi json export contract", () => {
  test("path count matches documentable inventory scale", () => {
    const pathCount = Object.keys(completeOpenApiSpec.paths).length;
    expect(pathCount).toBeGreaterThan(50);
    expect(pathCount).toBeLessThan(100);
  });

  test("includes provider webhook and session tags", () => {
    const tags = completeOpenApiSpec.tags.map((t) => t.name);
    expect(tags).toContain("Provider Webhook");
    expect(tags).toContain("Session API");
    expect(tags).toContain("Security Gap");
  });
});
