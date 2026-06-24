import { describe, expect, test } from "vitest";

import {
  API_SURFACE,
  AUTH_CLASSES,
  BODY_TYPES,
  EXPOSURE_CLASSES,
  OWNER_AREAS,
  SPEC_TARGETS,
  surfaceEntryKey,
} from "../app/lib/api-surface";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { PUBLIC_API_PATHS } from "../app/lib/public-api";

describe("complete openapi spec", () => {
  test("has basic OpenAPI structure", () => {
    expect(completeOpenApiSpec.openapi).toBe("3.0.3");
    expect(completeOpenApiSpec.info.title).toBe("CallCaster Complete API Surface");
  });

  test("includes all public SDK paths", () => {
    for (const path of PUBLIC_API_PATHS) {
      expect(completeOpenApiSpec.paths).toHaveProperty(path);
      expect(completeOpenApiSpec.paths[path as keyof typeof completeOpenApiSpec.paths]?.post).toBeDefined();
    }
  });

  test("documents completeOpenApi inventory entries", () => {
    const documentable = API_SURFACE.filter(
      (e) =>
        e.specTarget === "completeOpenApi" &&
        !(e.duplicate && e.routeModule.endsWith(".js")),
    );
    for (const entry of documentable) {
      expect(completeOpenApiSpec.paths).toHaveProperty(entry.path);
      for (const op of entry.operations) {
        const method = op.method.toLowerCase() as "post" | "get" | "put" | "patch" | "delete";
        const pathItem =
          completeOpenApiSpec.paths[
            entry.path as keyof typeof completeOpenApiSpec.paths
          ];
        expect(pathItem?.[method]).toBeDefined();
      }
    }
  });

  test("marks unsupported routes with x-callcaster-supported false", () => {
    const unsupported = API_SURFACE.filter(
      (e) => !e.supported && e.specTarget === "completeOpenApi",
    );
    expect(unsupported.length).toBeGreaterThan(0);
    for (const entry of unsupported.slice(0, 5)) {
      const op = Object.values(
        completeOpenApiSpec.paths[
          entry.path as keyof typeof completeOpenApiSpec.paths
        ] ?? {},
      )[0] as { "x-callcaster-supported"?: boolean } | undefined;
      expect(op?.["x-callcaster-supported"]).toBe(false);
    }
  });

  test("uses auth class tags on operations", () => {
    const publicOp =
      completeOpenApiSpec.paths["/api/chat_sms" as keyof typeof completeOpenApiSpec.paths]
        ?.post as { tags?: string[] } | undefined;
    expect(publicOp?.tags).toContain("Public API");
  });

  test("excludes inventory-only meta routes from paths", () => {
    expect(completeOpenApiSpec.paths).not.toHaveProperty("/api/docs/openapi");
    expect(completeOpenApiSpec.paths).not.toHaveProperty("/api/docs/openapi/all");
  });
});

describe("api surface inventory enums", () => {
  test("every inventory entry uses valid enum values", () => {
    for (const entry of API_SURFACE) {
      expect(AUTH_CLASSES).toContain(entry.authClass);
      expect(EXPOSURE_CLASSES).toContain(entry.exposure);
      expect(SPEC_TARGETS).toContain(entry.specTarget);
      expect(OWNER_AREAS).toContain(entry.ownerArea);
      for (const op of entry.operations) {
        expect(BODY_TYPES).toContain(op.bodyType);
      }
    }
  });

  test("public API inventory matches PUBLIC_API_PATHS", () => {
    const publicFromInventory = API_SURFACE.filter(
      (e) => e.specTarget === "publicOpenApi" && e.supported,
    ).map((e) => e.path);
    expect(publicFromInventory.sort()).toEqual([...PUBLIC_API_PATHS].sort());
  });

  test("weakUnknown routes include security warnings", () => {
    for (const entry of API_SURFACE.filter((e) => e.authClass === "weakUnknown")) {
      expect(entry.securityWarning, entry.path).toBeTruthy();
    }
  });

  test("duplicate outreach routes share duplicateGroup", () => {
    const dupes = API_SURFACE.filter((e) => e.path === "/api/outreach_attempts/:id");
    expect(dupes).toHaveLength(2);
    expect(new Set(dupes.map((d) => d.duplicateGroup))).toEqual(
      new Set(["outreach_attempts-id"]),
    );
  });

  test("surface keys are unique except explicit duplicate modules", () => {
    const keys = API_SURFACE.flatMap((e) =>
      e.operations.map((op) => `${surfaceEntryKey(e.path, op.method)}::${e.routeModule}`),
    );
    expect(keys.length).toBe(new Set(keys).size);
  });
});
