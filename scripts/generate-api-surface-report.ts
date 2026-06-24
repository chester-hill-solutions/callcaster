#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_SURFACE, AUTH_CLASS_TAGS } from "../app/lib/api-surface";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/api-surface-inventory.md");

function main() {
  const lines = [
    "# API Surface Inventory",
    "",
    "Generated from [`app/lib/api-surface.ts`](../app/lib/api-surface.ts).",
    "Regenerate with `npm run tools:api:surface:report`.",
    "",
    "Interactive specs:",
    "",
    "- [Public integrator API](/docs) — OpenAPI at [`/api/docs/openapi`](/api/docs/openapi)",
    "- [Complete classified surface](/docs?spec=complete) — OpenAPI at [`/api/docs/openapi/all`](/api/docs/openapi/all)",
    "",
    "| Path | Methods | Auth | Exposure | Supported | Module | Guide | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const entry of API_SURFACE) {
    const methods = entry.operations.map((o) => o.method).join(", ");
    const auth = AUTH_CLASS_TAGS[entry.authClass] ?? entry.authClass;
    const supported = entry.supported ? "yes" : "no";
    const moduleCell = `\`${entry.routeModule.replace("app/", "")}\``;
    const guide = `\`${entry.docsGuide}\``;
    const notes = [
      entry.duplicate ? "duplicate route" : null,
      entry.securityWarning ?? entry.notes ?? "",
    ]
      .filter(Boolean)
      .join("; ")
      .replace(/\|/g, "\\|");
    lines.push(
      `| \`${entry.path}\` | ${methods} | ${auth} | ${entry.exposure} | ${supported} | ${moduleCell} | ${guide} | ${notes} |`,
    );
  }

  lines.push("", `Total entries: **${API_SURFACE.length}**`, "");
  fs.writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`wrote ${OUT} (${API_SURFACE.length} entries)`);
}

main();
