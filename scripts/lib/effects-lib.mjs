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

export function effectCallOffsets(src, fileName) {
  const parsed = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
  const offsets = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (name === "useEffect" || name === "useLayoutEffect") {
        offsets.push(callee.getStart(parsed));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return offsets;
}
