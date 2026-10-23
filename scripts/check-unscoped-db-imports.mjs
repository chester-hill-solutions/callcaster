#!/usr/bin/env node
/**
 * ADR-0004: app/lib must use createTenantDb for tenant data. Existing direct
 * database imports are counted in scripts/baselines/unscoped-db-imports.txt
 * as <file>::<module><TAB><count>. New/increased debt and stale/reduced debt
 * fail. After removing debt, rewrite with --baseline. --root=<fixture>
 * applies to the scan and all baseline reads/writes for isolated CLI tests.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const BANNED_MODULES = new Set(["@/server/admin-db", "@/server/db"]);
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function options() {
  let root = resolve(import.meta.dirname, "..");
  let rootSeen = false;
  let rewrite = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--baseline") rewrite = true;
    else if (arg.startsWith("--root=") && arg.slice(7).trim() && !rootSeen) {
      root = resolve(arg.slice(7));
      rootSeen = true;
    } else
      throw new Error(
        `Invalid option: ${arg}. Use --root=<directory> and/or --baseline.`,
      );
  }
  return { root, rewrite };
}

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name))
      out.push(full);
  }
  return out;
}

function moduleArgument(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return node.moduleSpecifier;
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  ) {
    return node.moduleReference.expression;
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))
  )
    return node.arguments[0];
  return undefined;
}

function collectCurrent(root) {
  const current = new Map();
  for (const file of listSourceFiles(join(root, "app/lib"))) {
    const parsed = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const rel = relative(root, file).split(sep).join("/");
    function visit(node) {
      let arg = moduleArgument(node);
      while (arg && ts.isParenthesizedExpression(arg)) arg = arg.expression;
      if (
        arg &&
        (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
        BANNED_MODULES.has(arg.text)
      ) {
        const key = `${rel}::${arg.text}`;
        current.set(key, (current.get(key) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return current;
}

function readBaseline(file) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
  const result = new Map();
  for (const [index, line] of source.split("\n").entries()) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [key, count, extra] = line.split("\t");
    if (
      !/^app\/lib\/.+::@\/server\/(?:admin-db|db)$/.test(key) ||
      !/^[1-9]\d*$/.test(count ?? "") ||
      !Number.isSafeInteger(Number(count)) ||
      extra !== undefined ||
      result.has(key)
    ) {
      throw new Error(
        `Invalid baseline entry at ${file}:${index + 1}; expected a unique file::module<TAB>positive-count.`,
      );
    }
    result.set(key, Number(count));
  }
  return result;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function main() {
  const { root, rewrite } = options();
  const baseline = join(root, "scripts/baselines/unscoped-db-imports.txt");
  const current = collectCurrent(root);
  if (rewrite) {
    mkdirSync(dirname(baseline), { recursive: true });
    writeFileSync(
      baseline,
      [...current]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}\t${count}\n`)
        .join(""),
    );
    console.log(
      `check-unscoped-db-imports: baseline rewritten with ${current.size} importer/module entries.`,
    );
    return;
  }
  const allowed = readBaseline(baseline);
  const keys = [...new Set([...current.keys(), ...allowed.keys()])].sort();
  const drift = keys.filter(
    (key) => (current.get(key) ?? 0) !== (allowed.get(key) ?? 0),
  );
  if (!drift.length) {
    console.log(
      `check-unscoped-db-imports: ${current.size} baselined importer/module entries, no drift.`,
    );
    return;
  }
  console.error(
    "check-unscoped-db-imports FAILED — unscoped database import count drift:",
  );
  for (const key of drift)
    console.error(
      `  ${key}: current ${current.get(key) ?? 0}, permitted ${allowed.get(key) ?? 0}`,
    );
  console.error(
    "Use createTenantDb from @/server/tenant-db for new tenant access. Do not increase the baseline to accept new debt.",
  );
  const rootArg =
    root === resolve(import.meta.dirname, "..")
      ? ""
      : ` --root=${shellQuote(root)}`;
  console.error(
    `After removing debt, rewrite stale counts: node scripts/check-unscoped-db-imports.mjs${rootArg} --baseline`,
  );
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`check-unscoped-db-imports FAILED: ${error.message}`);
  process.exitCode = 1;
}
