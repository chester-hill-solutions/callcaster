/**
 * Pure compliance rules for the effects-strictness gate. Kept
 * side-effect free so the discipline is unit-testable — check-effects.mjs is
 * the runner.
 */

import ts from "typescript";

/** Tags every effect must carry, non-empty. */
export const REQUIRED_TAGS = ["@effect", "@effect-deps", "@effect-side-effects"];

/**
 * An effect is compliant when it answers the "why not a loader / fetcher /
 * derived render?" question in writing — or carries the `CANDIDATE-REMOVE`
 * marker instead. The `@effect-why-not-loader` tag exists to force
 * that answer, so an effect that cannot answer it must be surfaced for
 * removal, not parked silently.
 */
export function isEffectCompliant(tags) {
  const hasRequired = REQUIRED_TAGS.every((t) => t in tags && tags[t] !== "");
  if (!hasRequired) return false;
  const why = tags["@effect-why-not-loader"] ?? "";
  const candidateForRemoval = (tags["@effect"] ?? "").startsWith("CANDIDATE-REMOVE");
  return why !== "" || candidateForRemoval;
}

function dependencyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const owner = dependencyName(node.expression);
    return owner === null ? null : `${owner}.${node.name.text}`;
  }
  return null;
}

function containingSymbol(node) {
  const names = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      const name = parent.name ??
        (ts.isVariableDeclaration(parent.parent) ? parent.parent.name : undefined);
      if (name) names.unshift(name.getText());
      else if (ts.isFunctionDeclaration(parent)) names.unshift("default");
    } else if (ts.isClassDeclaration(parent) && parent.name) {
      names.unshift(parent.name.text);
    }
  }
  return names.join("/") || "module";
}

export function effectCalls(src, fileName) {
  const parsed = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (name === "useEffect" || name === "useLayoutEffect") {
        const array = node.arguments[1];
        const dependencies = array && ts.isArrayLiteralExpression(array)
          ? array.elements.map(dependencyName)
          : null;
        calls.push({
          offset: callee.getStart(parsed),
          line: parsed.getLineAndCharacterOfPosition(callee.getStart(parsed)).line + 1,
          symbol: containingSymbol(node),
          dependencies,
          declaration: array?.getText(parsed).replace(/\s+/g, " ") ?? "absent",
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return calls;
}

function documentedDependencies(text) {
  const value = text.trim();
  if (/^none\b/i.test(value)) return { names: [], explicit: true };
  if (!value.startsWith("[")) {
    const references = value.match(/[A-Za-z_$][\w$]*(?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*)*/g) ?? [];
    return { names: references.map((name) => name.replace(/\s/g, "").replace(/\?\./g, ".")), explicit: false };
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, value);
  let depth = 0;
  let end = -1;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.OpenBracketToken) depth++;
    if (token === ts.SyntaxKind.CloseBracketToken && --depth === 0) {
      end = scanner.getTextPos();
      break;
    }
  }
  if (end < 0) return null;
  const parsed = ts.createSourceFile("annotation.ts", `const deps = ${value.slice(0, end)};`, ts.ScriptTarget.Latest, true);
  const array = parsed.statements[0]?.declarationList?.declarations[0]?.initializer;
  if (parsed.parseDiagnostics.length || !array || !ts.isArrayLiteralExpression(array)) return null;
  const names = array.elements.map(dependencyName);
  return names.some((name) => name === null) ? null : { names, explicit: true };
}

export function effectDependencyViolations(call, documented) {
  if (!call.dependencies || call.dependencies.some((name) => name === null)) {
    return [`unsupported dependency array: ${call.declaration}`];
  }
  const declared = documentedDependencies(documented);
  if (!declared) return [`unsupported dependency annotation: ${documented}`];
  const actual = new Set(call.dependencies);
  const named = new Set(declared.names);
  const missing = [...actual].filter((name) => !named.has(name)).map((name) => `undocumented dependency: ${name}`);
  const extra = declared.explicit
    ? [...named].filter((name) => !actual.has(name)).map((name) => `unused documented dependency: ${name}`)
    : [];
  return [...missing, ...extra];
}
