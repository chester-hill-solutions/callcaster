/**
 * Pure path-classification for CI job scoping (see scripts/ci-changes.mjs).
 *
 * The E2E patterns are a superset of the app patterns: the compose gate boots
 * the built app, the bun server, the job worker, and the schema — so anything
 * that can change the client bundle can also change e2e. `app` scopes
 * bundle-guard; `e2e` scopes the E2E workflow. The quality job runs
 * unconditionally.
 *
 * Fail-safe policy lives in the CLI: a filter may skip a job only on real
 * evidence (a resolved diff), never on uncertainty.
 */
import { spawnSync } from "node:child_process";

/** Jobs that only make sense when the client bundle can change. */
export const APP_PATTERNS = [
  "app/**",
  "vendor/**",
  "shared/**",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "tsconfig.json",
  "vite.config.*",
  "react-router.config.*",
  "postcss.config.*",
  "tailwind*",
  "index.html",
  ".github/workflows/ci.yml",
];

/** Everything the compose E2E gate boots or builds. Superset of APP_PATTERNS. */
export const E2E_PATTERNS = [
  ...APP_PATTERNS,
  "e2e/**",
  "server/**",
  "worker/**",
  "services/**",
  "drizzle/**",
  "client/**",
  "Dockerfile*",
  "docker-compose*.yml",
  "scripts/e2e/**",
  "scripts/dev/**",
  "scripts/baselines/**",
  ".env.example",
  ".github/workflows/e2e.yml",
];

/** Glob -> RegExp. `**` crosses directories, `*` stays within one. */
export function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Single pass: a later .replace would re-scan tokens inserted by an
  // earlier one (the `*` pass would corrupt the `.*` from `**`).
  const rx = escaped.replace(/\*\*\/|\*\*|\*/g, (token) =>
    token === "**/" ? "(?:.*/)?" : token === "**" ? ".*" : "[^/]*",
  );
  return new RegExp(`^${rx}$`);
}

const APP_RX = APP_PATTERNS.map(globToRegExp);
const E2E_RX = E2E_PATTERNS.map(globToRegExp);

/**
 * Classify a changed-file list (repo-relative paths) into job scopes.
 * Empty input classifies to false/false — callers must treat an EMPTY diff
 * (unresolvable base, no-op range) as "run everything" upstream of this.
 */
export function classify(files) {
  return {
    app: files.some((file) => APP_RX.some((rx) => rx.test(file))),
    e2e: files.some((file) => E2E_RX.some((rx) => rx.test(file))),
  };
}

/**
 * Changed files vs a base ref, three-dot (what the PR/push touches since the
 * merge base, not the base branch tip). Returns null when git cannot resolve
 * the range — the CLI turns null into "run everything".
 */
export function changedFiles(base) {
  const res = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  if (res.status !== 0) return null;
  return res.stdout.split("\n").filter(Boolean);
}
