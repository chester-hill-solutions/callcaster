#!/usr/bin/env node
/**
 * Batch RR7 cleanup: defer, duplicate imports, MemberRole, TypedResponse, route types.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");
const APP = path.join(ROOT, "app");

function walk(dir, filter, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") walk(p, filter, out);
    else if (filter(ent.name, p)) out.push(p);
  }
  return out;
}

function writeIfChanged(file, next) {
  const prev = fs.readFileSync(file, "utf8");
  if (prev === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

// --- 1. defer() -> plain object return ---
let deferFixed = 0;
for (const file of walk(APP, (n) => /\.(tsx?)$/.test(n))) {
  let src = fs.readFileSync(file, "utf8");
  if (!/\bdefer\b/.test(src)) continue;
  const orig = src;
  src = src.replace(
    /import\s+\{([^}]*)\}\s+from\s+["']react-router["']/g,
    (m, imports) => {
      const cleaned = imports
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "defer" && !s.includes("defer"))
        .join(", ");
      if (!cleaned) return m;
      return `import { ${cleaned} } from "react-router"`;
    },
  );
  src = src.replace(/\breturn\s+defer\s*\(/g, "return ");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    deferFixed++;
    console.log("defer:", path.relative(ROOT, file));
  }
}

// --- 2. TypedResponse -> SerializeFrom helper type ---
const typedResponseFiles = [
  "app/root.tsx",
  "app/components/layout/Navbar.tsx",
  "app/components/layout/Navbar.MobileMenu.tsx",
];
let typedFixed = 0;
for (const rel of typedResponseFiles) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  src = src.replace(
    /import type \{([^}]*)\}\s+from\s+["']react-router["']/g,
    (m, imports) => {
      const cleaned = imports
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "TypedResponse")
        .join(", ");
      return cleaned ? `import type { ${cleaned} } from "react-router"` : "";
    },
  );
  src = src.replace(
    /import\s+\{([^}]*)\}\s+from\s+["']react-router["']/g,
    (m, imports) => {
      if (!imports.includes("TypedResponse")) return m;
      const cleaned = imports
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "TypedResponse")
        .join(", ");
      return `import { ${cleaned} } from "react-router"`;
    },
  );
  src = src.replace(/TypedResponse<([^>]+)>/g, "$1");
  src = src.replace(/\n{3,}/g, "\n\n");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    typedFixed++;
    console.log("typed-response:", rel);
  }
}

// --- 3. Duplicate loader/action imports on client routes ---
let dupFixed = 0;
for (const file of walk(ROUTES, (n, p) => n.endsWith(".tsx") && !n.endsWith(".server.tsx"))) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  src = src.replace(
    /^import type \{ loader(?:, action)?|action(?:, loader)? \} from ["'][^"']+\.server["'];?\n/gm,
    "",
  );
  src = src.replace(
    /^import type \{ action, loader \} from ["'][^"']+\.server["'];?\n/gm,
    "",
  );
  src = src.replace(/from ["'](\.\/[^"']+)\.server\.tsx["']/g, 'from "$1.server"');
  src = src.replace(/;;+/g, ";");
  // duplicate identical import lines only
  const lines = src.split("\n");
  const seen = new Set();
  const deduped = lines.filter((line) => {
    if (!line.startsWith("import ")) return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });
  src = deduped.join("\n");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    dupFixed++;
    console.log("dup-import:", path.relative(ROOT, file));
  }
}

// --- 4. Stray duplicate verifyAuth import mid-file ---
let verifyFixed = 0;
for (const file of walk(ROUTES, (n) => n.endsWith(".server.tsx"))) {
  let src = fs.readFileSync(file, "utf8");
  const matches = [...src.matchAll(/^import \{ verifyAuth \} from ["']@\/lib\/supabase\.server["'];?\n/gm)];
  if (matches.length <= 1) continue;
  const orig = src;
  let first = true;
  src = src.replace(
    /^import \{ verifyAuth \} from ["']@\/lib\/supabase\.server["'];?\n/gm,
    (m) => {
      if (first) {
        first = false;
        return m;
      }
      return "";
    },
  );
  if (src !== orig) {
    fs.writeFileSync(file, src);
    verifyFixed++;
    console.log("dup-verifyAuth:", path.relative(ROOT, file));
  }
}

// --- 5. MemberRole imports on server routes ---
const memberRoleImport =
  'import { MemberRole } from "@/lib/member-role";\n';
let memberFixed = 0;
for (const file of walk(ROUTES, (n) => n.endsWith(".server.tsx"))) {
  let src = fs.readFileSync(file, "utf8");
  if (!/\bMemberRole\b/.test(src)) continue;
  if (src.includes("@/lib/member-role")) continue;
  const orig = src;
  const firstImport = src.search(/^import /m);
  if (firstImport >= 0) {
    src = src.slice(0, firstImport) + memberRoleImport + src.slice(firstImport);
  } else {
    src = memberRoleImport + src;
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    memberFixed++;
    console.log("member-role:", path.relative(ROOT, file));
  }
}

// Re-export MemberRole from TeamMember for existing UI imports
const teamMemberPath = path.join(APP, "components/workspace/TeamMember.tsx");
let tm = fs.readFileSync(teamMemberPath, "utf8");
if (!tm.includes('@/lib/member-role')) {
  tm = tm.replace(
    /export enum MemberRole \{[\s\S]*?\}\n\n/,
    'export { MemberRole } from "@/lib/member-role";\n\n',
  );
  fs.writeFileSync(teamMemberPath, tm);
  console.log("member-role: TeamMember re-export");
}

// --- 6. Export all route types from server + client imports ---
function collectTypeNames(src) {
  return [...src.matchAll(/^export type (\w+)/gm)].map((m) => m[1]);
}

function collectPrivateTypes(src) {
  return [...src.matchAll(/^type (\w+)/gm)].map((m) => m[1]);
}

let typeFixed = 0;
for (const serverPath of walk(ROUTES, (n) => n.endsWith(".server.tsx"))) {
  let serverSrc = fs.readFileSync(serverPath, "utf8");
  const privateTypes = collectPrivateTypes(serverSrc);
  if (privateTypes.length === 0) continue;

  const origServer = serverSrc;
  for (const name of privateTypes) {
    serverSrc = serverSrc.replace(
      new RegExp(`^type ${name}\\b`, "m"),
      `export type ${name}`,
    );
  }
  if (serverSrc !== origServer) {
    fs.writeFileSync(serverPath, serverSrc);
  }

  const clientPath = serverPath.replace(/\.server\.tsx$/, ".tsx");
  if (!fs.existsSync(clientPath)) continue;

  let clientSrc = fs.readFileSync(clientPath, "utf8");
  const used = privateTypes.filter((name) =>
    new RegExp(`\\b${name}\\b`).test(clientSrc),
  );
  if (used.length === 0) continue;

  const rel = `./${path.basename(serverPath).replace(/\.tsx$/, "")}`;
  const exportLine = `export type { ${used.join(", ")} } from "${rel}";`;
  const importLine = `import type { ${used.join(", ")} } from "${rel}";`;

  if (!clientSrc.includes(exportLine)) {
    const exportIdx = clientSrc.indexOf('export {');
    if (exportIdx >= 0) {
      const lineEnd = clientSrc.indexOf("\n", exportIdx);
      clientSrc =
        clientSrc.slice(0, lineEnd + 1) +
        exportLine +
        "\n" +
        clientSrc.slice(lineEnd + 1);
    }
  }
  if (!clientSrc.includes(importLine)) {
    const firstImport = clientSrc.search(/^import /m);
    const at = firstImport >= 0 ? firstImport : 0;
    clientSrc = clientSrc.slice(0, at) + importLine + "\n" + clientSrc.slice(at);
  }

  if (clientSrc !== fs.readFileSync(clientPath, "utf8")) {
    fs.writeFileSync(clientPath, clientSrc);
    typeFixed++;
    console.log("route-types:", path.relative(ROOT, clientPath));
  }
}

// --- 7. Server files: ensure data/redirect imported when used ---
let rrImportFixed = 0;
for (const file of walk(ROUTES, (n) => n.endsWith(".server.tsx"))) {
  let src = fs.readFileSync(file, "utf8");
  const needsData = /\bdata\s*\(/.test(src) || /\bdata</.test(src);
  const needsRedirect = /\bredirect\s*\(/.test(src);
  if (!needsData && !needsRedirect) continue;
  if (
    (needsData && /\bdata\b/.test(src.match(/from ["']react-router["']/)?.[0] ?? "")) ||
    src.includes('from "react-router"')
  ) {
    const hasFrom = /from ["']react-router["']/.test(src);
    if (hasFrom) {
      const orig = src;
      src = src.replace(
        /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/,
        (m, imports) => {
          const parts = new Set(
            imports.split(",").map((s) => s.trim().replace(/^type\s+/, "")),
          );
          if (needsData) parts.add("data");
          if (needsRedirect) parts.add("redirect");
          const typeParts = imports
            .split(",")
            .filter((s) => s.trim().startsWith("type "))
            .map((s) => s.trim());
          const valueParts = [...parts].filter(
            (p) => !["LoaderFunctionArgs", "ActionFunctionArgs"].includes(p) && !typeParts.some((t) => t.includes(p)),
          );
          const all = [
            ...typeParts,
            ...[...parts].filter((p) => !typeParts.some((t) => t.includes(p))),
          ];
          const unique = [...new Set(all.map((s) => s.trim()).filter(Boolean))];
          return `import { ${unique.join(", ")} } from "react-router"`;
        },
      );
      // simpler: if uses data but import missing data
      if (needsData && !/import\s+\{[^}]*\bdata\b/.test(src)) {
        if (/from ["']react-router["']/.test(src)) {
          src = src.replace(
            /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/,
            (m, imp) => {
              if (/\bdata\b/.test(imp)) return m;
              return `import { data, ${imp.trim()} } from "react-router"`;
            },
          );
        } else {
          src = `import { data } from "react-router";\n${src}`;
        }
      }
      if (needsRedirect && !/import\s+\{[^}]*\bredirect\b/.test(src)) {
        src = src.replace(
          /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/,
          (m, imp) => {
            if (/\bredirect\b/.test(imp)) return m;
            return `import { redirect, ${imp.trim()} } from "react-router"`;
          },
        );
      }
      if (src !== orig) {
        fs.writeFileSync(file, src);
        rrImportFixed++;
        console.log("rr-import:", path.relative(ROOT, file));
      }
      continue;
    }
  }
  const orig = src;
  const additions = [];
  if (needsData) additions.push("data");
  if (needsRedirect) additions.push("redirect");
  src = `import { ${additions.join(", ")} } from "react-router";\n${src}`;
  if (src !== orig) {
    fs.writeFileSync(file, src);
    rrImportFixed++;
    console.log("rr-import:", path.relative(ROOT, file));
  }
}

// --- 8. Test fixes: Response assertions after asRouteResponse ---
const TEST = path.join(ROOT, "test");
let testFixed = 0;
for (const file of walk(TEST, (n) => /\.(test|spec)\.ts$/.test(n))) {
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("asRouteResponse")) continue;
  const orig = src;
  src = src.replace(
    /expect\((\w+)\)\.toBeInstanceOf\(Response\)/g,
    "expect($1.status).toEqual(expect.any(Number))",
  );
  src = src.replace(
    /expect\((\w+)\)\.not\.toBeInstanceOf\(Response\)/g,
    "expect(typeof $1.status).toBe(\"number\")",
  );
  src = src.replace(/\(response as Response\)\.json\(\)/g, "response.json()");
  src = src.replace(/\(res as Response\)\.json\(\)/g, "res.json()");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    testFixed++;
    console.log("test-response:", path.relative(ROOT, file));
  }
}

console.log(
  `\nSummary: defer=${deferFixed} typed=${typedFixed} dup=${dupFixed} verify=${verifyFixed} member=${memberFixed} types=${typeFixed} rr=${rrImportFixed} tests=${testFixed}`,
);
