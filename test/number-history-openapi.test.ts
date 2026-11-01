import { describe, expect, test } from "vitest";
import { openApiSpec } from "@/lib/openapi";

describe("number lifecycle API contract (#2995)", () => {
  test("documents lifecycle separately from number type and gives a nullable release date", () => {
    const schema = openApiSpec.components.schemas.WorkspacePhoneNumber;
    expect(schema.properties.status).toMatchObject({ type: "string", enum: ["active", "released"] });
    expect(schema.properties.released_at).toMatchObject({ type: "string", format: "date-time", nullable: true });
  });
  test("documents repeated release as a conflict", () => {
    const operation = openApiSpec.paths["/api/workspaces/{workspaceId}/numbers/{numberId}"].delete;
    expect(operation.responses["409"].description).toMatch(/already released/);
    expect(operation.responses["200"]).toBeDefined();
  });
});
