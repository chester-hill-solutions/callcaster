#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");
const CLIENT_HOOK =
  /\b(useLoaderData|useActionData|useNavigate|useFetcher|useSearchParams|useOutletContext|useParams|useRouteError|useRevalidator|useNavigation|useLocation)\b/;
const CLIENT_ROUTER_UI = /\b(Link|NavLink|Form|Await|Outlet)\b/;
const CLIENT_ONLY =
  /from ["']react["']|from ["']@\/components\/|from ["']lucide-react["']|from ["']sonner["']|from ["']react-icons/;

function isClientImport(imp) {
  if (CLIENT_ONLY.test(imp)) return true;
  if (/\buseEffect\b|\buseState\b|\buseMemo\b|\buseCallback\b|\buseRef\b/.test(imp)) return true;
  if (imp.includes('from "react-router"') || imp.includes("from 'react-router'")) {
    if (CLIENT_HOOK.test(imp) || CLIENT_ROUTER_UI.test(imp)) return true;
    if (!/\b(redirect|data|defer|json)\b/.test(imp) && /\btype\s+LoaderFunctionArgs\b/.test(imp)) {
      return false;
    }
    if (/\bActionFunctionArgs\b|\bLoaderFunctionArgs\b/.test(imp) && !CLIENT_HOOK.test(imp)) {
      return false;
    }
    if (CLIENT_HOOK.test(imp) || CLIENT_ROUTER_UI.test(imp)) return true;
  }
  if (imp.includes("@/lib/admin-workspaces")) return true;
  return false;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".server.tsx") || ent.name.endsWith(".server.ts")) out.push(p);
  }
  return out;
}

function routeClientPath(serverPath) {
  return serverPath.replace(/\.server\.(tsx|ts)$/, ".$1");
}

function extractImports(src) {
  const lines = src.split("\n");
  const imports = [];
  const rest = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("import ")) {
      const block = [line];
      i++;
      while (i < lines.length && !lines[i - 1].includes(";")) {
        block.push(lines[i]);
        i++;
      }
      imports.push(block.join("\n"));
      continue;
    }
    if (line.trim() === "" && rest.length === 0) {
      i++;
      continue;
    }
    rest.push(line);
    i++;
  }
  return { imports, body: rest.join("\n") };
}

let fixed = 0;
for (const serverPath of walk(ROUTES)) {
  const clientPath = routeClientPath(serverPath);
  if (!fs.existsSync(clientPath)) continue;

  const serverSrc = fs.readFileSync(serverPath, "utf8");
  const clientSrc = fs.readFileSync(clientPath, "utf8");
  if (!clientSrc.includes('from "./') && !clientSrc.includes("from './")) continue;
  if (!/export \{[^}]*(loader|action)/.test(clientSrc)) continue;

  const { imports, body: serverBody } = extractImports(serverSrc);
  const clientImports = [];
  const serverImports = [];
  for (const imp of imports) {
    if (isClientImport(imp)) {
      clientImports.push(imp);
    } else {
      serverImports.push(imp);
    }
  }

  if (clientImports.length === 0) continue;

  const clientLines = clientSrc.split("\n");
  const exportIdx = clientLines.findIndex((l) => l.startsWith("export {"));
  const badImportIdx = clientLines.findIndex(
    (l) => l.includes(".server") && l.startsWith("import "),
  );
  if (badImportIdx >= 0) {
    clientLines.splice(badImportIdx, 1);
    if (clientLines[badImportIdx]?.trim() === "") clientLines.splice(badImportIdx, 1);
  }

  const insertAt = exportIdx >= 0 ? exportIdx + 1 : 0;
  const existing = new Set(clientLines);
  const toAdd = clientImports.filter((imp) => !existing.has(imp));
  if (toAdd.length === 0 && clientImports.length > 0) {
    // still strip server
    fs.writeFileSync(serverPath, `${serverImports.join("\n")}\n\n${serverBody.trim()}\n`);
    fixed++;
    console.log("server-only:", path.relative(process.cwd(), serverPath));
    continue;
  }

  clientLines.splice(insertAt + 1, 0, "", ...toAdd, "");
  fs.writeFileSync(clientPath, clientLines.join("\n").replace(/\n{3,}/g, "\n\n"));
  fs.writeFileSync(serverPath, `${serverImports.join("\n")}\n\n${serverBody.trim()}\n`);
  fixed++;
  console.log("fixed:", path.relative(process.cwd(), clientPath));
}

console.log(`updated ${fixed} route pairs`);
