#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openApiSpec } from "../app/lib/openapi";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { integratorOpenApiSpec } from "../app/lib/openapi-integrator";

const root = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(path.join(root, "../openapi"), { recursive: true });
writeFileSync(
  path.join(root, "../openapi/public-api.json"),
  `${JSON.stringify(openApiSpec, null, 2)}\n`,
);
writeFileSync(
  path.join(root, "../openapi/integrator-api.json"),
  `${JSON.stringify(integratorOpenApiSpec, null, 2)}\n`,
);
writeFileSync(
  path.join(root, "../openapi/complete-api.json"),
  `${JSON.stringify(completeOpenApiSpec, null, 2)}\n`,
);
