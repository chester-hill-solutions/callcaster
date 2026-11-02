import path from "node:path";
import ts from "typescript";

const modules = new Map([
  ["app/lib/worker/webhook-side-effects.server", { runCallStatusSideEffects: "sync" }],
  ["app/lib/worker/enqueue-call-status.server", { enqueueCallStatusSideEffects: "async" }],
]);
const cache = new Map();

/** Identify actual calls to the two canonical voice-result billing boundaries. */
export function voiceBillingHandlerSignals(source, filename = "app/routes/handler.ts") {
  if (!source.includes("webhook-side-effects.server") && !source.includes("enqueue-call-status.server")) return new Set();
  const key = filename + "\0" + source;
  if (cache.has(key)) return cache.get(key);
  const file = path.posix.resolve("/", filename);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const program = ts.createProgram([file], { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest }, {
    getSourceFile: name => name === file ? tree : undefined,
    getDefaultLibFileName: () => "lib.d.ts", writeFile: () => {}, getCurrentDirectory: () => "/",
    getDirectories: () => [], fileExists: name => name === file, readFile: name => name === file ? source : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  });
  const checker = program.getTypeChecker(), result = new Set();
  function importedBoundary(node) {
    const declaration = checker.getSymbolAtLocation(node)?.declarations?.[0];
    if (!declaration || (!ts.isImportSpecifier(declaration) && !ts.isNamespaceImport(declaration))) return null;
    const imported = ts.isImportSpecifier(declaration) ? declaration.propertyName?.text ?? declaration.name.text : null;
    const clause = ts.isImportSpecifier(declaration) ? declaration.parent.parent : declaration.parent;
    if (clause.isTypeOnly || declaration.isTypeOnly) return null;
    const specifier = clause.parent.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) return null;
    const target = specifier.text.startsWith("@/") ? "app/" + specifier.text.slice(2)
      : specifier.text.startsWith(".") ? path.posix.join(path.posix.dirname(filename), specifier.text) : "";
    const boundary = modules.get(target.replace(/\.[cm]?[jt]sx?$/, ""));
    return boundary ? { imported, boundary } : null;
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) {
        const found = importedBoundary(callee);
        if (found?.imported && found.boundary[found.imported]) result.add(found.boundary[found.imported]);
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const found = importedBoundary(callee.expression);
        if (found && !found.imported && found.boundary[callee.name.text]) result.add(found.boundary[callee.name.text]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); cache.set(key, result); return result;
}
