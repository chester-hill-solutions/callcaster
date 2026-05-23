#!/usr/bin/env node
/* eslint-env node */

import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve("app/routes");
const SERVER_IMPORT =
  /from\s+['"](@\/|~\/|\.\.?\/)[^'"]*\.server[^'"]*['"]|from\s+['"]@\/twilio\.server['"]/;

const ALLOWED_REEXPORTS = new Set([
  "loader",
  "action",
  "headers",
  "links",
  "meta",
  "middleware",
  "ErrorBoundary",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function getNamedExports(src) {
  const names = [];
  const patterns = [
    /export\s+async\s+function\s+(\w+)/g,
    /export\s+function\s+(\w+)/g,
    /export\s+const\s+(\w+)\s*=/g,
    /export\s+class\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(src))) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)];
}

function hasDefaultExport(src) {
  return /export\s+default\s/.test(src);
}

function needsSplit(src) {
  if (!SERVER_IMPORT.test(src)) return false;
  if (hasDefaultExport(src)) return true;
  const exports = getNamedExports(src);
  return exports.some((name) => !ALLOWED_REEXPORTS.has(name));
}

function serverModulePath(routePath) {
  const parsed = path.parse(routePath);
  return path.join(parsed.dir, `${parsed.name}.server${parsed.ext}`);
}

function relativeImport(from, to) {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.(tsx|ts)$/, "");
}

for (const routePath of walk(ROUTES_DIR)) {
  const src = fs.readFileSync(routePath, "utf8");
  if (!needsSplit(src)) continue;

  const serverPath = serverModulePath(routePath);
  if (fs.existsSync(serverPath)) {
    console.log(`skip (exists): ${serverPath}`);
    continue;
  }

  const exports = getNamedExports(src);
  const serverExports = exports.filter((name) => !ALLOWED_REEXPORTS.has(name));
  const routeExports = exports.filter((name) => ALLOWED_REEXPORTS.has(name));

  if (!hasDefaultExport(src) && serverExports.length > 0) {
    fs.writeFileSync(serverPath, src);
    const importPath = relativeImport(routePath, serverPath);
    const exportNames = exports.join(", ");
    fs.writeFileSync(
      routePath,
      `export { ${exportNames} } from "${importPath}";\n`,
    );
    console.log(`shim: ${path.relative(process.cwd(), routePath)}`);
    continue;
  }

  if (hasDefaultExport(src)) {
    const loaderActionExports = routeExports.filter((n) =>
      ["loader", "action", "headers", "middleware"].includes(n),
    );
    if (loaderActionExports.length === 0) continue;

    const importPath = relativeImport(routePath, serverPath);
    const lines = src.split("\n");
    const importLines = [];
    const otherLines = [];
    let inImport = true;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        inImport &&
        (trimmed.startsWith("import ") ||
          trimmed === "" ||
          trimmed.startsWith("//"))
      ) {
        if (trimmed.startsWith("import ")) {
          if (SERVER_IMPORT.test(line)) importLines.push(line);
          else otherLines.push(line);
        } else if (trimmed === "" && importLines.length > 0) {
          inImport = false;
          otherLines.push(line);
        } else {
          otherLines.push(line);
        }
      } else {
        inImport = false;
        otherLines.push(line);
      }
    }

    const loaderStart = otherLines.findIndex((l) =>
      /^export\s+(async\s+)?function\s+(loader|action)\b/.test(l.trim()),
    );
    if (loaderStart === -1) {
      console.log(`manual: ${path.relative(process.cwd(), routePath)}`);
      continue;
    }

    let loaderEnd = otherLines.length;
    for (let i = loaderStart + 1; i < otherLines.length; i += 1) {
      if (
        /^export\s+default\s/.test(otherLines[i].trim()) ||
        (/^export\s+(async\s+)?function\s+\w+/.test(otherLines[i].trim()) &&
          !/^export\s+(async\s+)?function\s+(loader|action)\b/.test(
            otherLines[i].trim(),
          ))
      ) {
        loaderEnd = i;
        break;
      }
    }

    const serverBody = [
      ...importLines,
      "",
      ...otherLines.slice(loaderStart, loaderEnd),
    ].join("\n");
    const clientBody = [
      ...otherLines.slice(0, loaderStart),
      ...otherLines.slice(loaderEnd),
    ].join("\n");

    const reexports = loaderActionExports
      .map((n) => `${n}`)
      .join(", ");
    const shim = `export { ${reexports} } from "${importPath}";\n\n${clientBody.trim()}\n`;

    fs.writeFileSync(serverPath, `${serverBody.trim()}\n`);
    fs.writeFileSync(routePath, shim);
    console.log(`split: ${path.relative(process.cwd(), routePath)}`);
  }
}
