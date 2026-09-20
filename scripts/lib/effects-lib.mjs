/**
 * Pure compliance rules for the effects-strictness gate (#1924). Kept
 * side-effect free so the discipline is unit-testable — check-effects.mjs is
 * the runner.
 */

/** Tags every effect must carry, non-empty. */
export const REQUIRED_TAGS = ["@effect", "@effect-deps", "@effect-side-effects"];

/**
 * An effect is compliant when it answers the "why not a loader / fetcher /
 * derived render?" question in writing — or carries the `CANDIDATE-REMOVE`
 * marker instead (#1924). The `@effect-why-not-loader` tag exists to force
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