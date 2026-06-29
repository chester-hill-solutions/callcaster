import { describe, expect, test } from "vitest";

import {
  API_SURFACE,
  getPublicOpenApiEntries,
  AUTH_CLASSES,
  BODY_TYPES,
  EXPOSURE_CLASSES,
  OWNER_AREAS,
  SPEC_TARGETS,
  surfaceEntryKey,
} from "../app/lib/api-surface";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { openApiSpec } from "../app/lib/openapi";
import { toOpenApiPath } from "../app/lib/openapi-build";
import { INTEGRATOR_API_PATHS } from "../app/lib/public-api";

describe("complete openapi spec", () => {
  test("has basic OpenAPI structure", () => {
    expect(completeOpenApiSpec.openapi).toBe("3.0.3");
    expect(completeOpenApiSpec.info.title).toBe("CallCaster Complete API Surface");
  });

  test("includes all integrator SDK paths", () => {
    for (const path of INTEGRATOR_API_PATHS) {
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
      const openApiPath = toOpenApiPath(entry.path);
      expect(completeOpenApiSpec.paths).toHaveProperty(openApiPath);
      for (const op of entry.operations) {
        const method = op.method.toLowerCase() as "post" | "get" | "put" | "patch" | "delete";
        const pathItem =
          completeOpenApiSpec.paths[
            openApiPath as keyof typeof completeOpenApiSpec.paths
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
          toOpenApiPath(entry.path) as keyof typeof completeOpenApiSpec.paths
        ] ?? {},
      )[0] as { "x-callcaster-supported"?: boolean } | undefined;
      expect(op?.["x-callcaster-supported"]).toBe(false);
    }
  });

  test("uses integrator tag on chat_sms operation", () => {
    const publicOp =
      completeOpenApiSpec.paths["/api/chat_sms" as keyof typeof completeOpenApiSpec.paths]
        ?.post as { tags?: string[] } | undefined;
    expect(publicOp?.tags).toContain("Integrator API");
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

  test("integrator paths are publicOpenApi; user session routes are too", () => {
    for (const path of INTEGRATOR_API_PATHS) {
      const entry = API_SURFACE.find((e) => e.path === path);
      expect(entry?.specTarget).toBe("publicOpenApi");
      expect(entry?.supported).toBe(true);
    }
    const publicEntries = getPublicOpenApiEntries();
    expect(publicEntries.length).toBeGreaterThanOrEqual(100);
    expect(publicEntries.some((e) => e.path === "/api/workspaces")).toBe(true);
    expect(publicEntries.some((e) => e.path === "/api/auth/token")).toBe(true);
  });

  test("public OpenAPI covers publicOpenApi inventory", () => {
    for (const entry of getPublicOpenApiEntries()) {
      if (entry.duplicate && entry.routeModule.endsWith(".js")) continue;
      expect(openApiSpec.paths).toHaveProperty(toOpenApiPath(entry.path));
    }
  });

  test("weakUnknown routes include security warnings", () => {
    for (const entry of API_SURFACE.filter((e) => e.authClass === "weakUnknown")) {
      expect(entry.securityWarning, entry.path).toBeTruthy();
    }
  });

  test("outreach attempt id route is singular in inventory", () => {
    const entries = API_SURFACE.filter((e) => e.path === "/api/outreach_attempts/:id");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.routeModule).toBe("app/routes/api+/outreach_attempts/$id.route.tsx");
  });

  test("surface keys are unique except explicit duplicate modules", () => {
    const keys = API_SURFACE.flatMap((e) =>
      e.operations.map((op) => `${surfaceEntryKey(e.path, op.method)}::${e.routeModule}`),
    );
    expect(keys.length).toBe(new Set(keys).size);
  });
});
