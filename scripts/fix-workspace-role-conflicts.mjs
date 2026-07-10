#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const baseDir = path.join(root, "app/routes/workspaces+/$id");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (
      entry.name.endsWith(".loader.server.ts") ||
      entry.name.endsWith(".action.server.ts")
    ) {
      files.push(full);
    }
  }
  return files;
}

for (const file of walk(baseDir)) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  if (!src.includes("getWorkspaceRouteContext")) continue;

  // Remove duplicate workspaceId from params
  src = src.replace(
    /const \{ headers, user, workspaceId(?:, userRole)? \} = getWorkspaceRouteContext\(context\);\n\s*const workspaceId = params\.id;\n/g,
    (match) => match.replace(/\s*const workspaceId = params\.id;\n/, ""),
  );
  src = src.replace(
    /const \{ headers, user, workspaceId, userRole \} = getWorkspaceRouteContext\(context\);\n\s*const workspaceId = params\.id;\n/g,
    "const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);\n",
  );

  // Remove redundant getUserRole after context (middleware already verified)
  src = src.replace(
    /\n\s*const userRole = await getUserRole\(\{\s*\n\s*user,\s*\n\s*workspaceId,\s*\n\s*\}\);\s*\n\s*if \(!userRole\?\.(role|role\))\s*\{[\s\S]*?\}\s*\n/g,
    "\n",
  );

  // userRole.role → userRole when userRole comes from context string
  if (
    src.includes("getWorkspaceRouteContext(context)") &&
    src.includes("userRole.role")
  ) {
    src = src.replace(/userRole\.role/g, "userRole");
    src = src.replace(/userRole\?\.role/g, "userRole");
  }

  // Remove unused getUserRole import
  if (!src.includes("getUserRole(") && src.includes('import { getUserRole }')) {
    src = src.replace(/import \{ getUserRole \} from "@\/lib\/database\.server";\n?/, "");
  }

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("fixed", path.relative(root, file));
  }
}

// campaigns.loader.server.ts - add context to args
const campaignsLoader = path.join(
  root,
  "app/routes/workspaces+/$id/campaigns.loader.server.ts",
);
if (fs.existsSync(campaignsLoader)) {
  let src = fs.readFileSync(campaignsLoader, "utf8");
  if (!src.includes("{ request, params, context }")) {
    src = src.replace(
      /LoaderFunctionArgs\) => \{/,
      "LoaderFunctionArgs) => {",
    );
    src = src.replace(
      /export const loader = async \(\{ request, params \}/,
      "export const loader = async ({ request, params, context }",
    );
    src = src.replace(
      /requireWorkspaceLoaderContext\(request, params\.id\)/,
      "requireWorkspaceLoaderContext(request, params.id, { context })",
    );
    fs.writeFileSync(campaignsLoader, src);
    console.log("fixed campaigns.loader");
  }
}
