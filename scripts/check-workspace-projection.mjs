#!/usr/bin/env node
/**
 * Client route entry points must not import raw workspace readers. Product
 * workspace routes keep their existing rule; admin UI/API entries also refuse
 * global lists and raw joins. Admin client types use WorkspaceClientData.
 * Server-only helpers can read credentials for Twilio operations. This import
 * and type check cannot prove response dataflow; payload tests cover that.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const rawAdminReaders = new Set([
  "getWorkspaceById",
  "getWorkspaceWithCampaigns",
  "listAllWorkspacesOrdered",
  "listUserWorkspaceMembershipsWithWorkspace",
  "listPendingInvitesForUsername",
]);
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(file)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [file]
        : [];
  });
}
function entryPoint(file) {
  return /\.(?:loader|action)\.server\.ts$|\.tsx$/.test(file);
}
function importedNames(node) {
  if (
    ts.isImportDeclaration(node) &&
    node.importClause?.namedBindings &&
    ts.isNamedImports(node.importClause.namedBindings)
  ) {
    return node.importClause.namedBindings.elements.map(
      (name) => (name.propertyName ?? name.name).text,
    );
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause)
  ) {
    return node.exportClause.elements.map(
      (name) => (name.propertyName ?? name.name).text,
    );
  }
  return [];
}
const clientFields = new Set([
  "id",
  "name",
  "created_at",
  "credits",
  "disabled",
  "feature_flags",
  "coaching_config",
]);
function isSafePick(node) {
  const parent = node.parent;
  if (
    !ts.isTypeReferenceNode(parent) ||
    !ts.isIdentifier(parent.typeName) ||
    parent.typeName.text !== "Pick" ||
    parent.typeArguments?.[0] !== node
  )
    return false;
  const keys = parent.typeArguments[1];
  if (!keys) return false;
  const members = ts.isUnionTypeNode(keys) ? keys.types : [keys];
  return members.every(
    (key) =>
      ts.isLiteralTypeNode(key) &&
      ts.isStringLiteral(key.literal) &&
      clientFields.has(key.literal.text),
  );
}

const hits = [];
for (const folder of [
  "app/routes/workspaces+",
  "app/routes/admin+",
  "app/routes/api+/admin+",
]) {
  const admin = folder !== "app/routes/workspaces+";
  for (const file of walk(path.join(root, folder))) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (/(?:^|\/)archive\/|(?:^|\/)old\./.test(relative)) continue;
    const inspectImports = !admin || entryPoint(file);
    const inspectTypes =
      admin && (/\.tsx$/.test(file) || file.endsWith("admin.types.ts"));
    inspect(
      file,
      relative,
      inspectImports
        ? admin
          ? rawAdminReaders
          : new Set(["getWorkspaceById"])
        : new Set(),
      inspectTypes,
    );
  }
}
const overview = path.join(
  root,
  "app/components/workspace/WorkspaceOverview.tsx",
);
if (fs.existsSync(overview))
  inspect(overview, path.relative(root, overview), new Set(), true);

function inspect(file, relative, forbidden, inspectTypes) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    for (const name of importedNames(node)) {
      if (forbidden.has(name))
        hits.push(
          `${relative}: raw reader ${name}; use a projected admin service or getWorkspaceForClient`,
        );
    }
    if (
      inspectTypes &&
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === "Tables" &&
      !isSafePick(node) &&
      node.typeArguments?.some(
        (arg) =>
          ts.isLiteralTypeNode(arg) &&
          ts.isStringLiteral(arg.literal) &&
          arg.literal.text === "workspace",
      )
    ) {
      hits.push(
        `${relative}: full workspace client type; use WorkspaceClientData`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (hits.length) {
  console.error(
    "Workspace projection check FAILED:\n" +
      hits.map((hit) => `  ${hit}`).join("\n"),
  );
  process.exit(1);
}
console.log(
  "Workspace projection check passed (product and admin entry imports; admin client types).",
);
