#!/usr/bin/env node
/* eslint-env node */
/**
 * Ensure the stow binary (Docker-free S3-compatible dev bucket service) is
 * resolvable, downloading the pinned release for the host platform when it is
 * not. Prints the resolved binary path.
 *
 * Resolution priority (matches @chs/stow):
 *   1. STOW_BIN env var
 *   2. <repo>/bin/stow (checked-in convenience copy)
 *   3. `stow` on PATH
 *   4. Download release tarball → <repo>/.stow-bin/stow (gitignored)
 *
 * Usage:
 *   node scripts/e2e/ensure-stow.mjs
 *   STOW_VERSION=v0.1.0 node scripts/e2e/ensure-stow.mjs
 */
import { accessSync, chmodSync, constants } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const CACHE_DIR = join(rootDir, ".stow-bin");

/** Pinned tag on chester-hill-solutions/stow-s3; override with STOW_VERSION. */
const STOW_VERSION = process.env.STOW_VERSION ?? "v0.1.0";
/** Release repo. Was `stow`, transferred to `stow-s3` — the old path 301s. */
const STOW_REPO = "chester-hill-solutions/stow-s3";

// The cache is keyed by version, not just called `stow`. A single fixed name
// means a bumped STOW_VERSION silently keeps serving the previously-downloaded
// binary, so the pin stops meaning anything after the first run.
const CACHED_BIN = join(CACHE_DIR, `stow-${STOW_VERSION}`);

function platformSuffix() {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `${os}-${arch}`;
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Download + extract the pinned release tarball for this platform. */
async function downloadRelease() {
  await mkdir(CACHE_DIR, { recursive: true });
  const asset = `stow-${platformSuffix()}.tar.gz`;
  const archive = join(CACHE_DIR, asset);
  const base = `https://github.com/${STOW_REPO}/releases/download/${STOW_VERSION}`;

  console.error(`[ensure-stow] downloading ${STOW_VERSION} (${platformSuffix()})…`);
  const sums = spawnSync("curl", ["-fsSL", "-o", "-", `${base}/SHA256SUMS.txt`], {
    encoding: "utf8",
  });
  if (sums.status !== 0) {
    throw new Error(
      `Could not fetch ${base}/SHA256SUMS.txt — is ${STOW_VERSION} published with assets?`,
    );
  }
  const expected = sums.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === asset)?.[0];
  if (!expected) {
    throw new Error(
      `${STOW_VERSION} publishes no ${asset}. Available:\n${sums.stdout.trim()}`,
    );
  }

  const curl = spawnSync("curl", ["-fsSL", "-o", archive, `${base}/${asset}`], {
    stdio: "inherit",
  });
  if (curl.status !== 0) {
    throw new Error(`Download failed: ${base}/${asset}`);
  }

  // We execute this binary on every test run and in CI, so the published
  // checksum is the only thing standing between a compromised release asset and
  // arbitrary code in the E2E job. Verify before extracting, never after.
  const digest = spawnSync("sha256sum", [archive], { encoding: "utf8" });
  if (digest.status !== 0) {
    throw new Error("Could not compute sha256 of the download");
  }
  const actual = digest.stdout.trim().split(/\s+/)[0];
  if (actual !== expected) {
    await rm(archive, { force: true });
    throw new Error(
      `Checksum mismatch for ${asset}\n  expected ${expected}\n  actual   ${actual}`,
    );
  }
  console.error(`[ensure-stow] sha256 verified (${actual.slice(0, 12)}…)`);

  const tar = spawnSync("tar", ["-xzf", archive, "-C", CACHE_DIR, "stow"], {
    stdio: "inherit",
  });
  await rm(archive, { force: true });
  if (tar.status !== 0) {
    throw new Error("Extraction failed");
  }
  // The tarball always contains a file called `stow`; rename it to the
  // version-keyed cache name so a pin bump cannot reuse a stale binary.
  const extracted = join(CACHE_DIR, "stow");
  if (extracted !== CACHED_BIN) {
    await rm(CACHED_BIN, { force: true });
    await rename(extracted, CACHED_BIN);
  }
  try {
    chmodSync(CACHED_BIN, 0o755);
  } catch {
    // release tarballs ship the executable bit; chmod is a fallback
  }
}

export async function resolveStowBinary() {
  const fromEnv = process.env.STOW_BIN?.trim();
  if (fromEnv) return fromEnv;

  const repoBin = join(rootDir, "bin", "stow");
  if (isExecutable(repoBin)) return repoBin;

  const onPath = spawnSync("which", ["stow"], { stdio: "ignore" }).status === 0;
  if (onPath) return "stow";

  if (!isExecutable(CACHED_BIN)) {
    await downloadRelease();
  }
  return CACHED_BIN;
}

/** True when a usable binary is already available (no network needed). */
export async function stowBinaryAvailable() {
  const fromEnv = process.env.STOW_BIN?.trim();
  if (fromEnv) return isExecutable(fromEnv);
  if (isExecutable(join(rootDir, "bin", "stow"))) return true;
  if (spawnSync("which", ["stow"], { stdio: "ignore" }).status === 0) return true;
  return isExecutable(CACHED_BIN);
}

// CLI entry: `node scripts/e2e/ensure-stow.mjs` prints the binary path.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(await resolveStowBinary());
  } catch (error) {
    // A bare throw here surfaces as an unhandled rejection with a stack trace
    // that buries the one line a human needs.
    console.error(`[ensure-stow] ${error?.message ?? error}`);
    process.exit(1);
  }
}