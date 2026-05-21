#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx") && !ent.name.endsWith(".server.tsx")) {
      out.push(p);
    }
  }
  return out;
}

function serverPath(clientPath) {
  const base = clientPath.replace(/\.tsx$/, "");
  const server = `${base}.server.tsx`;
  return fs.existsSync(server) ? server : null;
}

function collectTypeNames(src) {
  const names = [];
  for (const m of src.matchAll(/^type\s+(\w+)\s*=/gm)) names.push(m[1]);
  return names;
}

function exportTypesInServer(src, typeNames) {
  let next = src;
  for (const name of typeNames) {
    next = next.replace(new RegExp(`^type\\s+${name}\\s*=`, "m"), `export type ${name} =`);
  }
  return next;
}

function clientUsesType(src, name) {
  return new RegExp(`\\b${name}\\b`).test(src);
}

function clientHasTypeImport(src, name) {
  return new RegExp(`import\\s+type\\s+\\{[^}]*\\b${name}\\b`).test(src);
}

let fixed = 0;
for (const clientPath of walk(ROUTES)) {
  const server = serverPath(clientPath);
  if (!server) continue;

  let clientSrc = fs.readFileSync(clientPath, "utf8");
  if (!/export \{[^}]*(loader|action)/.test(clientSrc)) continue;

  let serverSrc = fs.readFileSync(server, "utf8");
  const typeNames = collectTypeNames(serverSrc).filter((name) =>
    clientUsesType(clientSrc, name),
  );
  if (typeNames.length === 0) continue;

  const relServer = `./${path.basename(server)}`;
  const missing = typeNames.filter((name) => !clientHasTypeImport(clientSrc, name));
  if (missing.length === 0) continue;

  serverSrc = exportTypesInServer(serverSrc, typeNames);
  fs.writeFileSync(server, serverSrc);

  const exportLine = `export type { ${typeNames.join(", ")} } from "${relServer}";`;
  const importLine = `import type { ${missing.join(", ")} } from "${relServer}";`;

  const lines = clientSrc.split("\n");
  const exportIdx = lines.findIndex((l) => l.startsWith("export {"));
  if (exportIdx < 0) continue;

  if (!lines.some((l) => l.startsWith("export type {"))) {
    lines.splice(exportIdx + 1, 0, exportLine);
  }
  const firstImport = lines.findIndex((l) => l.startsWith("import "));
  const insertAt = firstImport >= 0 ? firstImport : exportIdx + 2;
  lines.splice(insertAt, 0, importLine);
  clientSrc = lines.join("\n");
  fs.writeFileSync(clientPath, clientSrc);
  fixed++;
  console.log(path.relative(process.cwd(), clientPath), "->", missing.join(", "));
}

console.log(`updated ${fixed} client routes`);
