/* eslint-env node */
/**
 * The set of Railway environments that still exist.
 *
 * The Railway CLI is the source of truth. `railway environment` refuses to run
 * outside a TTY, so `railway status --json` is used instead: it returns the
 * linked project including every environment, and it works headless.
 *
 * Bail out rather than guess. An empty or partial list here would classify
 * every live environment as dead, and a caller acting on that would delete
 * resources that are still in use.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The names of the Railway environments that still exist.
 * Throws when the CLI is missing, is not linked, or reports nothing.
 */
export async function loadRailwayEnvironments() {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("railway", ["status", "--json"], {
      timeout: 30_000,
    }));
  } catch (error) {
    throw new Error(
      "Could not read Railway project status (is the railway CLI installed and " +
        "linked to the CallCaster project?): " +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Railway CLI returned output this script cannot parse:\n${stdout}`);
  }

  const names = (parsed?.environments?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node) => node && !node.deletedAt)
    .map((node) => node.name)
    .filter((name) => typeof name === "string" && name.length > 0);

  if (names.length === 0) {
    throw new Error(
      "Railway reported zero environments. Refusing to prune, since that would " +
        "delete every environment app including live ones.",
    );
  }

  return new Set(names);
}
