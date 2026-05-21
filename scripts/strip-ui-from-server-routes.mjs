#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".server.tsx")) out.push(p);
  }
  return out;
}

function clientPath(serverPath) {
  return serverPath.replace(/\.server\.tsx$/, ".tsx");
}

function hasUiCode(src) {
  return (
    /<\w+/.test(src) ||
    /export\s+default\s+function/.test(src) ||
    /export\s+default\s+\w/.test(src) ||
    /export\s+\{\s*ErrorBoundary\s*\}/.test(src)
  );
}

function findUiStart(lines) {
  let sawLoaderOrAction = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^export\s+(const|async function)\s+(loader|action)\b/.test(line)) {
      sawLoaderOrAction = true;
    }
    if (!sawLoaderOrAction) continue;
    if (
      /^const\s+[A-Z]/.test(line) ||
      /^function\s+[A-Z]/.test(line) ||
      /^export\s+default\b/.test(line) ||
      /^export\s+\{\s*ErrorBoundary/.test(line)
    ) {
      return i;
    }
  }
  return -1;
}

let fixed = 0;
for (const serverPath of walk(ROUTES)) {
  const src = fs.readFileSync(serverPath, "utf8");
  if (!hasUiCode(src)) continue;

  const lines = src.split("\n");
  const uiStart = findUiStart(lines);
  if (uiStart < 0) continue;

  const serverPart = lines.slice(0, uiStart).join("\n").trim();
  const uiPart = lines.slice(uiStart).join("\n").trim();
  if (!uiPart) continue;

  const clientPath_ = clientPath(serverPath);
  if (!fs.existsSync(clientPath_)) continue;

  let client = fs.readFileSync(clientPath_, "utf8");
  const exportLine = client
    .split("\n")
    .find((l) => l.startsWith("export {") && l.includes(".server"));
  if (!exportLine) continue;

  // Remove duplicate loader import from client
  client = client
    .split("\n")
    .filter(
      (l) =>
        !(
          l.includes(".server") &&
          l.startsWith("import ") &&
          /\b(loader|action)\b/.test(l)
        ),
    )
    .join("\n");

  if (!client.includes(uiPart.slice(0, 40))) {
    const header = exportLine + "\n\n";
    const rest = client.replace(exportLine, "").trim();
    client = header + rest + "\n\n" + uiPart + "\n";
    fs.writeFileSync(clientPath_, client);
  }

  fs.writeFileSync(serverPath, serverPart + "\n");
  fixed++;
  console.log("stripped UI:", path.relative(process.cwd(), serverPath));
}

console.log(`stripped ${fixed} server route files`);
