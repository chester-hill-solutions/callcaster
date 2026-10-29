import { describe, expect, test } from "vitest";

import { openApiSpec } from "../app/lib/openapi";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";

describe("complete openapi json export contract", () => {
  test.each([
    ["public", openApiSpec],
    ["complete", completeOpenApiSpec],
  ])("%s spec requires workspace scope for number search", (_name, spec) => {
    expect(spec.paths["/api/numbers"].get).toMatchObject({
      security: [{ sessionCookie: [] }, { secureSessionCookie: [] }],
      parameters: [
        { name: "workspace_id", in: "query", required: true },
      ],
    });
  });

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
