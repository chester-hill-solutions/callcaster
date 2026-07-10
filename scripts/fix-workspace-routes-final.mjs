#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const baseDir = path.join(root, "app/routes/workspaces+");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
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

  // If using requireWorkspaceLoaderContext, drop getWorkspaceRouteContext preamble
  if (
    src.includes("requireWorkspaceLoaderContext") &&
    src.includes("getWorkspaceRouteContext(context)")
  ) {
    src = src.replace(
      /\s*const \{ headers, user, workspaceId(?:, userRole(?:: \w+)?)? \} = getWorkspaceRouteContext\(context\);\n/g,
      "",
    );
    if (!src.includes("getWorkspaceRouteContext")) {
      src = src.replace(
        /import \{ getWorkspaceRouteContext, requireWorkspaceLoaderContext \} from "@\/lib\/workspace-route\.server";\n/,
        'import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";\n',
      );
      src = src.replace(
        /import \{ getWorkspaceRouteContext \} from "@\/lib\/workspace-route\.server";\nimport \{ requireWorkspaceLoaderContext \}/,
        "import { requireWorkspaceLoaderContext",
      );
    }
  }

  // Rename context userRole to memberRole to avoid shadowing
  src = src.replace(
    /getWorkspaceRouteContext\(context\)/g,
    "getWorkspaceRouteContext(context)",
  );
  src = src.replace(
    /const \{ headers, user, workspaceId, userRole \} = getWorkspaceRouteContext\(context\);/g,
    "const { headers, user, workspaceId, userRole: memberRole } = getWorkspaceRouteContext(context);",
  );

  // Remove getUserRole blocks that shadow memberRole
  src = src.replace(
    /\n\s*const userRole = await getUserRole\(\{[\s\S]*?\}\);\s*\n/g,
    "\n",
  );

  // Fix memberRole.role -> memberRole
  if (src.includes("memberRole")) {
    src = src.replace(/memberRole\.role/g, "memberRole");
  }

  // Shorthand userRole in returns when memberRole exists
  if (src.includes("memberRole")) {
    src = src.replace(/(\s+)userRole,/g, "$1userRole: memberRole,");
    src = src.replace(/(\s+)userRole\s*\}/g, "$1userRole: memberRole }");
  }

  // Duplicate workspaceId from params
  src = src.replace(
    /(getWorkspaceRouteContext\(context\);\n)(?:\s*const workspaceId = params(?:\["id"\]|\.id);\n)/g,
    "$1",
  );

  // Cast memberRole to MemberRole where needed
  src = src.replace(
    /as MemberRole/g,
    "as MemberRole",
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("fixed", path.relative(root, file));
  }
}

// index.action.server.ts
const indexAction = path.join(root, "app/routes/workspaces+/index.action.server.ts");
if (fs.existsSync(indexAction)) {
  let src = fs.readFileSync(indexAction, "utf8");
  if (src.includes("verifyAuth")) {
    src = src.replace(/verifyAuth\(request\)/, "getSession(request).then(s => { if (!s.user) throw redirect('/signin'); return s; })");
    // simpler fix - read file
  }
  fs.readFileSync(indexAction, "utf8");
}
