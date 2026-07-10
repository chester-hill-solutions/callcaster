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
  if (file.endsWith("$id.loader.server.ts")) continue;
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  src = src.replace(/,\s*context,\s*context/g, ", context");
  src = src.replace(/context,\s*context/g, "context");

  // Remaining verifyAuth → getWorkspaceRouteContext
  if (src.includes("verifyAuth")) {
    if (!src.includes("getWorkspaceRouteContext")) {
      src = `import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";\n${src}`;
    }
    src = src.replace(
      /import \{ verifyAuth \} from "@\/lib\/auth\.server";\n?/g,
      "",
    );
    src = src.replace(
      /const \{\s*user\s*\} = await verifyAuth\(request[^)]*\);/g,
      "const { user } = getWorkspaceRouteContext(context)",
    );
    src = src.replace(
      /const \{\s*headers,\s*user\s*\} = await verifyAuth\(request[^)]*\);/g,
      "const { headers, user } = getWorkspaceRouteContext(context)",
    );
    src = src.replace(
      /const \{\s*user,\s*headers\s*\} = await verifyAuth\(request[^)]*\);/g,
      "const { headers, user } = getWorkspaceRouteContext(context)",
    );
    src = src.replace(/await verifyAuth\(request[^)]*\);/g, "");
  }

  // Remove duplicate workspaceId from params when already from context
  src = src.replace(
    /const \{ headers, user, workspaceId, userRole \} = getWorkspaceRouteContext\(context\);\n\s*const workspaceId = params\.id;\n/g,
    "const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);\n",
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("fixed", path.relative(root, file));
  }
}

// Fix index.action if exists
const indexAction = path.join(root, "app/routes/workspaces+/index.action.server.ts");
if (fs.existsSync(indexAction)) {
  let src = fs.readFileSync(indexAction, "utf8");
  if (src.includes("verifyAuth")) {
    src = src.replace(/import \{ verifyAuth \} from "@\/lib\/auth\.server";\n/, "");
    if (!src.includes("getSession")) {
      src = src.replace(
        /from "react-router";/,
        'from "react-router";\nimport { getSession } from "@/lib/auth.server";',
      );
    }
    src = src.replace(
      /const \{\s*user[^}]*\} = await verifyAuth\(request\);/,
      "const { user, headers } = await getSession(request);\n  if (!user) throw redirect('/signin');",
    );
    fs.writeFileSync(indexAction, src);
    console.log("fixed index.action");
  }
}
