#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openApiSpec } from "../app/lib/openapi";

const root = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(path.join(root, "../openapi"), { recursive: true });
writeFileSync(
  path.join(root, "../openapi/public-api.json"),
  `${JSON.stringify(openApiSpec, null, 2)}\n`,
);
