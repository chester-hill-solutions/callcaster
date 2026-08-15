#!/usr/bin/env node
/**
 * API surface coverage gate.
 *
 * Since #1242 D4 the inventory's mechanical half is GENERATED from the route
 * tree, so the checks this gate used to make — does every registered route
 * have an entry, does every entry name a real module — are true by
 * construction. What replaces them is the pair of checks that construction
 * makes possible:
 *
 *   1. the committed generated core is not stale, and
 *   2. the hand-written annotations line up with it exactly — no route without
 *      prose, no prose for a route that no longer exists, and no declared
 *      `authClass` that the handler's own auth strategy contradicts.
 *
 * The OpenAPI and integrator assertions below are unchanged: they check the
 * published contract (ADR-0014, ADR-0018) rather than the inventory's shape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_SURFACE, getPublicOpenApiEntries } from "../app/lib/api-surface";
import { API_SURFACE_ANNOTATIONS } from "../app/lib/api-surface-annotations";
import { API_SURFACE_CORE } from "../app/lib/api-surface-generated";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { openApiSpec } from "../app/lib/openapi";
import { toOpenApiPath } from "../app/lib/openapi-build";
import {
  INTEGRATOR_API_PATHS,
} from "../app/lib/public-api";
import { deriveApiSurfaceCores } from "./lib/api-surface-derive.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "docs/api-surface-inventory.md");
const writeReport = process.argv.includes("--write-report");

type DerivedCore = {
  path: string;
  routeModule: string;
  authClass: string | null;
  authVia: string;
  authAllows: string[] | null;
  operations: { method: string; handler: string; capability?: string }[];
};

async function main() {
  if (writeReport) {
    await import("./generate-api-surface-report");
  }

  const errors: string[] = [];

  // ── 1. the committed core still matches the code it was derived from ──
  const { cores, diagnostics } = deriveApiSurfaceCores({ root: ROOT }) as {
    cores: DerivedCore[];
    diagnostics: string[];
  };
  for (const d of diagnostics) errors.push(`derivation: ${d}`);

  const committed = new Map(API_SURFACE_CORE.map((c) => [c.routeModule, c]));
  const derived = new Map(cores.map((c) => [c.routeModule, c]));
  const shape = (c: { path: string; authClass: string | null; operations: readonly { method: string; handler: string; capability?: string }[] }) =>
    `${c.path}|${c.authClass ?? "-"}|${c.operations
      .map((o) => `${o.method}:${o.handler}:${o.capability ?? "-"}`)
      .sort()
      .join(",")}`;

  for (const [mod, want] of derived) {
    const got = committed.get(mod);
    if (!got) {
      errors.push(
        `api-surface-generated.ts is stale — missing ${want.path} (${mod}); run \`npm run tools:api:surface:generate\``,
      );
    } else if (shape(got) !== shape(want)) {
      errors.push(
        `api-surface-generated.ts is stale for ${want.path}:\n      committed ${shape(got)}\n      derived   ${shape(want)}`,
      );
    }
  }
  for (const [mod, got] of committed) {
    if (!derived.has(mod)) {
      errors.push(
        `api-surface-generated.ts lists ${got.path} (${mod}) but it is no longer a callable route; run \`npm run tools:api:surface:generate\``,
      );
    }
  }

  // ── 2. annotations line up with the generated core, both directions ──
  for (const core of API_SURFACE_CORE) {
    const annotation = API_SURFACE_ANNOTATIONS[core.routeModule];
    if (!annotation) {
      errors.push(
        `no annotation for generated route ${core.path} (${core.routeModule}) — add one to app/lib/api-surface-annotations.ts`,
      );
      continue;
    }
    if (!annotation.docsGuide) errors.push(`annotation ${core.path} missing docsGuide`);
    if (!annotation.exposure) errors.push(`annotation ${core.path} missing exposure`);
    if (!annotation.ownerArea) errors.push(`annotation ${core.path} missing ownerArea`);

    // An authoritative derivation is not overridable; a declaration alongside
    // one is either redundant or a lie, and both should be deleted.
    if (core.authClass && annotation.authClass) {
      errors.push(
        `annotation ${core.path} declares authClass "${annotation.authClass}" but ` +
          `${core.authVia} authoritatively enforces "${core.authClass}" — remove the declaration`,
      );
    }
    if (!core.authClass && !annotation.authClass) {
      errors.push(
        `annotation ${core.path} must declare an authClass: no authoritative strategy fixes it (${core.authVia})`,
      );
    }

    // A declared class the handler's auth cannot actually produce is drift.
    const evidence = derived.get(core.routeModule);
    if (!core.authClass && annotation.authClass && evidence?.authAllows) {
      if (!evidence.authAllows.includes(annotation.authClass)) {
        errors.push(
          `annotation ${core.path} declares authClass "${annotation.authClass}", which ` +
            `${evidence.authVia} cannot produce (permits ${evidence.authAllows.join(", ")})`,
        );
      }
    }
  }
  for (const routeModule of Object.keys(API_SURFACE_ANNOTATIONS)) {
    if (!committed.has(routeModule)) {
      errors.push(
        `annotation for ${routeModule} has no generated route — delete it from app/lib/api-surface-annotations.ts`,
      );
    }
  }

  for (const entry of API_SURFACE) {
    if (entry.authClass === "weakUnknown" && !entry.securityWarning) {
      errors.push(
        `weakUnknown route ${entry.path} must include securityWarning`,
      );
    }
    for (const op of entry.operations) {
      if (!op.bodyType || !op.method) {
        errors.push(`inventory entry ${entry.path} has incomplete operation`);
      }
    }
  }

  for (const integratorPath of INTEGRATOR_API_PATHS) {
    const entry = API_SURFACE.find((e) => e.path === integratorPath);
    if (!entry || entry.specTarget !== "publicOpenApi" || !entry.supported) {
      errors.push(
        `integrator API path ${integratorPath} not marked supported/publicOpenApi`,
      );
    }
    if (!openApiSpec.paths[integratorPath as keyof typeof openApiSpec.paths]) {
      errors.push(`public OpenAPI missing integrator path ${integratorPath}`);
    }
    if (!completeOpenApiSpec.paths[integratorPath as keyof typeof completeOpenApiSpec.paths]) {
      errors.push(`complete OpenAPI missing integrator path ${integratorPath}`);
    }
  }

  for (const entry of getPublicOpenApiEntries()) {
    if (entry.duplicate && entry.routeModule.endsWith(".js")) {
      continue;
    }
    const pathItem =
      openApiSpec.paths[toOpenApiPath(entry.path) as keyof typeof openApiSpec.paths];
    if (!pathItem) {
      errors.push(
        `public OpenAPI missing inventory entry ${entry.path} (specTarget publicOpenApi)`,
      );
      continue;
    }
    for (const op of entry.operations) {
      const method = op.method.toLowerCase() as
        | "get"
        | "post"
        | "put"
        | "patch"
        | "delete";
      if (!(method in pathItem)) {
        errors.push(`public OpenAPI missing ${op.method} ${entry.path}`);
      }
    }
  }

  for (const entry of API_SURFACE) {
    if (entry.specTarget !== "completeOpenApi") {
      continue;
    }
    if (entry.duplicate && entry.routeModule.endsWith(".js")) {
      continue;
    }
    const pathItem =
      completeOpenApiSpec.paths[
        toOpenApiPath(entry.path) as keyof typeof completeOpenApiSpec.paths
      ];
    if (!pathItem) {
      errors.push(
        `complete OpenAPI missing inventory entry ${entry.path} (specTarget completeOpenApi)`,
      );
      continue;
    }
    for (const op of entry.operations) {
      const method = op.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
      if (!(method in pathItem)) {
        errors.push(`complete OpenAPI missing ${op.method} ${entry.path}`);
      }
    }
  }

  if (!fs.existsSync(REPORT)) {
    errors.push(
      "docs/api-surface-inventory.md missing; run tools:api:surface:report",
    );
  } else if (!writeReport) {
    const before = fs.readFileSync(REPORT, "utf8");
    await import("./generate-api-surface-report");
    const after = fs.readFileSync(REPORT, "utf8");
    if (before !== after) {
      errors.push(
        "docs/api-surface-inventory.md is stale; run npm run tools:api:surface:report",
      );
    }
  }

  if (errors.length) {
    console.error("API surface coverage check failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `API surface coverage OK (${API_SURFACE.length} entries: ` +
      `${API_SURFACE_CORE.filter((c) => c.authClass).length} authClass derived, ` +
      `${API_SURFACE_CORE.filter((c) => !c.authClass).length} declared and cross-checked)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
