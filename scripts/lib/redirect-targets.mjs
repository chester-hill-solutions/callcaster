import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { matchRoutes } from "react-router";

const REDIRECT_EXPORTS = new Set(["redirect", "redirectDocument"]);

export function routeSourceFiles(routes, root) {
  const appDir = path.resolve(root, "app");
  const routeDir = path.join(appDir, "routes");
  const files = new Set();
  function include(file, registered = false) {
    if (files.has(file)) return;
    if (!registered && !file.startsWith(routeDir + path.sep) && path.dirname(file) !== appDir) return;
    if (!fs.existsSync(file)) throw new Error(`Registered route source is missing: ${file}`);
    files.add(file);
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      const specifier = node.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith(".") && !specifier.text.startsWith("@/routes/")) continue;
      const base = specifier.text.startsWith("@/routes/")
        ? path.resolve(root, "app", specifier.text.slice(2))
        : path.resolve(path.dirname(file), specifier.text);
      const extensions = [".ts", ".tsx", ".js", ".jsx"];
      const dependency = [base, ...extensions.map(ext => base + ext), ...extensions.map(ext => path.join(base, "index" + ext))]
        .find(candidate => extensions.includes(path.extname(candidate)) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (dependency) include(dependency);
    }
  }
  function walk(nodes) {
    for (const node of nodes) {
      if (typeof node.file !== "string") throw new Error("Route tree has no source file");
      include(path.resolve(appDir, node.file), true);
      if (node.children) walk(node.children);
    }
  }
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("Registered route tree is empty");
  walk(routes);
  return [...files].sort();
}

function frameworkImport(declaration) {
  let node = declaration;
  while (node && !ts.isImportDeclaration(node)) node = node.parent;
  return node && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "react-router";
}

function isRedirectCall(expression, checker) {
  if (ts.isIdentifier(expression)) {
    const declarations = checker.getSymbolAtLocation(expression)?.declarations ?? [];
    return declarations.some(node => ts.isImportSpecifier(node) && frameworkImport(node)
      && REDIRECT_EXPORTS.has((node.propertyName ?? node.name).text));
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
    && REDIRECT_EXPORTS.has(expression.name.text)) {
    const declarations = checker.getSymbolAtLocation(expression.expression)?.declarations ?? [];
    return declarations.some(node => ts.isNamespaceImport(node) && frameworkImport(node));
  }
  return false;
}

export function checkRedirectTargets(routes, files) {
  const program = ts.createProgram(files, { noResolve: true, noLib: true, allowJs: true });
  const checker = program.getTypeChecker();
  const failures = [];
  let checked = 0;
  let dynamic = 0;
  let external = 0;
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`Cannot parse route source: ${file}`);
    function visit(node) {
      if (ts.isCallExpression(node) && isRedirectCall(node.expression, checker)) {
        const argument = node.arguments[0];
        if (!argument || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument))) {
          dynamic += 1;
        } else if (argument.text.startsWith("/") && !argument.text.startsWith("//")) {
          checked += 1;
          if (!matchRoutes(routes, argument.text)) {
            const { line } = source.getLineAndCharacterOfPosition(argument.getStart(source));
            failures.push({ file, line: line + 1, target: argument.text });
          }
        } else if (!argument.text.startsWith(".")) {
          external += 1;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { failures, checked, dynamic, external };
}
