/* eslint-env node */
/**
 * The environment names that still exist.
 *
 * Two sources, because neither one is complete on its own.
 *
 * - The Railway CLI reports the long-lived environments (dev, qa, production)
 *   and anything else the project still has. It does NOT report pull-request
 *   preview environments.
 * - GitHub reports the pull requests that are still open. Railway creates a
 *   `callcaster-pr-<number>` preview environment for an open pull request and
 *   removes it when the pull request closes. The environment leaves a TwiML
 *   App behind, and that App is the resource the prune tools look at.
 *
 * The union is the set of environments that are still alive. A preview that
 * Railway cannot see is still alive while its pull request is open, and a
 * TwiML App belonging to a live preview must never be deleted.
 *
 * This matters: the Railway list alone contains no `callcaster-pr-*` name at
 * all, so a tool that treats "not in the Railway list" as "gone" calls every
 * pull-request preview dead, including the preview of a pull request that is
 * open right now.
 *
 * Both sources fail closed. If either cannot be read, this throws rather than
 * returning a short list, because a short list reads as "this environment is
 * gone" and the caller deletes.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadRailwayEnvironments } from "./railway-environments.mjs";

const execFileAsync = promisify(execFile);

/** Railway names pull-request environments after the pull request. */
export const PULL_REQUEST_ENVIRONMENT_PREFIX = "callcaster-pr-";

/** The most open pull requests this will enumerate. */
const OPEN_PULL_REQUEST_LIMIT = 500;

/**
 * The numbers of the pull requests that are still open.
 * Throws when the list cannot be read or is too long to trust.
 */
export async function loadOpenPullRequestNumbers({
  repository = "chester-hill-solutions/callcaster",
} = {}) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        repository,
        "--state",
        "open",
        "--json",
        "number",
        "--limit",
        String(OPEN_PULL_REQUEST_LIMIT),
      ],
      { timeout: 60_000 },
    ));
  } catch (error) {
    throw new Error(
      "Could not read the open pull requests (is the gh CLI installed and " +
        `authenticated for ${repository}?): ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`gh returned output this script cannot parse:\n${stdout}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("gh returned no pull request list, so no preview can be called alive");
  }
  if (parsed.length >= OPEN_PULL_REQUEST_LIMIT) {
    throw new Error(
      `There are at least ${OPEN_PULL_REQUEST_LIMIT} open pull requests, which is more than this ` +
        "script can enumerate safely. Refusing to treat any preview as dead.",
    );
  }

  return parsed.map((pullRequest) => pullRequest?.number).filter((number) => Number.isInteger(number));
}

/**
 * The union of the two sources.
 *
 * The Railway environments, plus one preview environment per open pull
 * request. An open pull request's preview is alive even though Railway does
 * not report it, and that is the whole reason this function exists.
 */
export function mergeLiveEnvironmentNames(railwayEnvironments, openPullRequestNumbers) {
  const names = new Set(railwayEnvironments);
  for (const number of openPullRequestNumbers) {
    names.add(`${PULL_REQUEST_ENVIRONMENT_PREFIX}${number}`);
  }
  return names;
}

/**
 * The names of every environment that still exists: the Railway environments
 * plus one per open pull request.
 */
export async function loadLiveEnvironmentNames(options = {}) {
  const railwayEnvironments = await loadRailwayEnvironments();
  const openPullRequests = await loadOpenPullRequestNumbers(options);
  return mergeLiveEnvironmentNames(railwayEnvironments, openPullRequests);
}
