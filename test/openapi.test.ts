import { describe, expect, test } from "vitest";

import { openApiSpec } from "../app/lib/openapi";

describe("openapi spec", () => {
  test("has basic OpenAPI structure", () => {
    expect(openApiSpec.openapi).toBe("3.0.3");
    expect(openApiSpec.info.title).toBeTruthy();
    expect(openApiSpec.paths).toHaveProperty("/api/campaigns/create-with-script");
  });
});

