#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_SURFACE } from "../app/lib/api-surface";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { PUBLIC_API_PATHS } from "../app/lib/public-api";
import {
  groupRouteModulesByPath,
  parseApiRoutesFromReactRouter,
} from "./lib/parse-api-routes.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "docs/api-surface-inventory.md");
const writeReport = process.argv.includes("--write-report");

function normalizeInventoryPath(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

async function main() {
  if (writeReport) {
    await import("./generate-api-surface-report");
  }

  const registered = parseApiRoutesFromReactRouter({ cwd: ROOT });
  const byPath = groupRouteModulesByPath(registered);

  const errors: string[] = [];

  const inventoryPaths = new Set(API_SURFACE.map((e) => e.path));

  for (const [routePath, modules] of byPath.entries()) {
    const fullPath = normalizeInventoryPath(routePath);
    if (!inventoryPaths.has(fullPath)) {
      errors.push(`missing inventory entry for registered route ${fullPath}`);
      continue;
    }
    for (const mod of modules) {
      const known = API_SURFACE.some(
        (e) => e.path === fullPath && e.routeModule === mod,
      );
      if (!known) {
        errors.push(
          `inventory missing module ${mod} for registered route ${fullPath}`,
        );
      }
    }
  }

  for (const entry of API_SURFACE) {
    if (entry.path === "/api/docs/openapi/all") {
      continue;
    }
    const registeredModules = byPath.get(entry.path);
    if (!registeredModules && !entry.duplicate) {
      errors.push(`inventory entry ${entry.path} is not registered in route tree`);
    }
    if (!entry.docsGuide) {
      errors.push(`inventory entry ${entry.path} missing docsGuide`);
    }
    if (!entry.authClass) {
      errors.push(`inventory entry ${entry.path} missing authClass`);
    }
    if (!entry.exposure) {
      errors.push(`inventory entry ${entry.path} missing exposure`);
    }
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

  for (const publicPath of PUBLIC_API_PATHS) {
    const entry = API_SURFACE.find((e) => e.path === publicPath);
    if (!entry || entry.specTarget !== "publicOpenApi" || !entry.supported) {
      errors.push(
        `public API path ${publicPath} not marked supported/publicOpenApi`,
      );
    }
    if (!completeOpenApiSpec.paths[publicPath as keyof typeof completeOpenApiSpec.paths]) {
      errors.push(`complete OpenAPI missing public path ${publicPath}`);
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
        entry.path as keyof typeof completeOpenApiSpec.paths
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
    `API surface coverage OK (${registered.length} registered paths, ${API_SURFACE.length} inventory entries)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
