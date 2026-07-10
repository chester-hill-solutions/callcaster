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
  if (file.endsWith("$id.middleware.server.ts")) continue;

  let src = fs.readFileSync(file, "utf8");
  const original = src;

  if (
    !src.includes("verifyAuth") &&
    !src.includes("requireWorkspaceLoaderContext")
  ) {
    continue;
  }

  if (!src.includes("context") && src.includes("LoaderFunctionArgs")) {
    src = src.replace(
      /(\{[^}]*)(params)([^}]*\}:\s*LoaderFunctionArgs)/,
      "$1params, context$3",
    );
    src = src.replace(
      /(\{[^}]*)(request,\s*params)([^}]*\}:\s*LoaderFunctionArgs)/,
      "$1request, params, context$3",
    );
  }
  if (!src.includes("context") && src.includes("ActionFunctionArgs")) {
    src = src.replace(
      /(\{[^}]*)(request,\s*params)([^}]*\}:\s*ActionFunctionArgs)/,
      "$1request, params, context$3",
    );
    src = src.replace(
      /(\{\s*request\s*\}:\s*ActionFunctionArgs)/,
      "{ request, context }: ActionFunctionArgs",
    );
  }

  src = src.replace(
    /requireWorkspaceLoaderContext\(request,\s*params\.(\w+)\)/g,
    "requireWorkspaceLoaderContext(request, params.$1, { context })",
  );

  if (src.includes("verifyAuth")) {
    if (!src.includes("getWorkspaceRouteContext")) {
      src = src.replace(
        /import \{ verifyAuth \} from "@\/lib\/auth\.server";\n?/,
        "",
      );
      const wsImport =
        'import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";\n';
      if (src.includes("@/lib/workspace-route.server")) {
        src = src.replace(
          /from "@\/lib\/workspace-route\.server";/,
          'from "@/lib/workspace-route.server";\nimport { getWorkspaceRouteContext } from "@/lib/workspace-route.server";',
        );
        src = src.replace(
          /import \{ getWorkspaceRouteContext \} from "@\/lib\/workspace-route\.server";\nimport \{/,
          "import { getWorkspaceRouteContext, ",
        );
      } else {
        src = wsImport + src;
      }
    }

    src = src.replace(
      /const \{\s*headers,\s*user\s*\} = await verifyAuth\(request[^)]*\);\s*\n/g,
      "const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);\n",
    );
    src = src.replace(
      /const \{\s*user,\s*headers\s*\} = await verifyAuth\(request[^)]*\);\s*\n/g,
      "const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);\n",
    );
  }

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("updated", path.relative(root, file));
  }
}
