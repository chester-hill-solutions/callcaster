import { spawnSync } from "node:child_process";

function ancestorStatus(candidate, ref, repoRoot) {
  return spawnSync("git", ["merge-base", "--is-ancestor", candidate, ref], {
    cwd: repoRoot,
    stdio: "ignore",
  }).status;
}

/**
 * Git reports ancestry by exit status: 0 means ancestor, 1 means not ancestor.
 * Other failures are unknown, so only a confirmed master miss and dev match
 * count as a dev-only fix. See https://git-scm.com/docs/git-merge-base.
 * @param {unknown[]} candidates
 * @param {string} repoRoot
 */
export function hasDevOnlyFix(candidates, repoRoot) {
  return candidates.some((candidate) =>
    typeof candidate === "string" &&
    ancestorStatus(candidate, "origin/master", repoRoot) === 1 &&
    ancestorStatus(candidate, "origin/dev", repoRoot) === 0,
  );
}
