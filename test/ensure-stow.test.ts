import { afterEach, describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
const version = "v2493-test";

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(
  checksum: "valid" | "wrong" | "missing" | "unavailable" = "valid",
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ensure-stow-")));
  roots.push(root);
  const commands = join(root, "commands");
  const scripts = join(root, "scripts", "e2e");
  const payload = join(root, "payload");
  for (const dir of [commands, scripts, payload])
    mkdirSync(dir, { recursive: true });
  const script = join(scripts, "ensure-stow.mjs");
  copyFileSync(resolve("scripts/e2e/ensure-stow.mjs"), script);

  const executable = (path: string, source: string) => {
    writeFileSync(path, `#!${process.execPath}\n${source}`, { mode: 0o755 });
  };
  const executed = join(root, "executed");
  executable(
    join(payload, "stow"),
    `
    require("node:fs").writeFileSync(process.env.FIXTURE_EXECUTED, "executed");
    console.log("fixture-stow");
  `,
  );
  const archive = join(root, "release.tar.gz");
  execFileSync("/usr/bin/tar", ["-czf", archive, "-C", payload, "stow"], {
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
  });
  const asset = `stow-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "amd64"}.tar.gz`;
  const digest = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  const sums = join(root, "SHA256SUMS.txt");
  writeFileSync(
    sums,
    `${checksum === "wrong" ? "0".repeat(64) : digest}  ${checksum === "missing" ? "other-platform.tar.gz" : asset}\n`,
  );

  const downloads = join(root, "downloads");
  const extractions = join(root, "extractions");
  executable(join(commands, "which"), "process.exit(1);\n");
  executable(
    join(commands, "curl"),
    `
    const fs = require("node:fs");
    const args = process.argv.slice(2);
    const url = args.at(-1);
    fs.appendFileSync(process.env.FIXTURE_DOWNLOADS, url + "\\n");
    if (url.endsWith("/SHA256SUMS.txt")) {
      if (process.env.FIXTURE_CHECKSUM === "unavailable") process.exit(22);
      process.stdout.write(fs.readFileSync(process.env.FIXTURE_SUMS));
    } else {
      fs.copyFileSync(process.env.FIXTURE_ARCHIVE, args[args.indexOf("-o") + 1]);
    }
  `,
  );
  executable(
    join(commands, "tar"),
    `
    require("node:fs").appendFileSync(process.env.FIXTURE_EXTRACTIONS, "extract\\n");
    const result = require("node:child_process").spawnSync("/usr/bin/tar", process.argv.slice(2), {
      stdio: "inherit", env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }
    });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  `,
  );
  const env = {
    PATH: commands,
    STOW_VERSION: version,
    FIXTURE_CHECKSUM: checksum,
    FIXTURE_SUMS: sums,
    FIXTURE_ARCHIVE: archive,
    FIXTURE_DOWNLOADS: downloads,
    FIXTURE_EXTRACTIONS: extractions,
    FIXTURE_EXECUTED: executed,
  };
  return {
    run: () =>
      spawnSync(process.execPath, [script], {
        env,
        encoding: "utf8",
        timeout: 10000,
      }),
    cached: join(root, ".stow-bin", `stow-${version}`),
    downloadedArchive: join(root, ".stow-bin", asset),
    payload: join(payload, "stow"),
    downloads,
    extractions,
    executed,
    env,
  };
}

describe("Stow bootstrap CLI", () => {
  test("verifies and extracts a cold download without sha256sum on PATH", () => {
    const f = fixture();
    const result = f.run();
    expect(result.stderr).toContain("sha256 verified");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(f.cached);
    expect(readFileSync(f.cached)).toEqual(readFileSync(f.payload));
    expect(readFileSync(f.extractions, "utf8")).toBe("extract\n");
    expect(existsSync(f.downloadedArchive)).toBe(false);
    expect(existsSync(f.executed)).toBe(false);
    expect(
      execFileSync(f.cached, { env: f.env, encoding: "utf8" }).trim(),
    ).toBe("fixture-stow");
    expect(readFileSync(f.executed, "utf8")).toBe("executed");
  });

  test("rejects a wrong checksum before extraction and removes the archive", () => {
    const f = fixture("wrong");
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Checksum mismatch");
    expect(existsSync(f.extractions)).toBe(false);
    expect(existsSync(f.cached)).toBe(false);
    expect(existsSync(f.executed)).toBe(false);
    expect(existsSync(f.downloadedArchive)).toBe(false);
  });

  test.each([
    ["missing", "publishes no stow-"],
    ["unavailable", "Could not fetch"],
  ] as const)(
    "rejects %s published checksums before downloading or extracting",
    (checksum, message) => {
      const f = fixture(checksum);
      const result = f.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(readFileSync(f.downloads, "utf8").trim().split("\n")).toHaveLength(
        1,
      );
      expect(existsSync(f.downloadedArchive)).toBe(false);
      expect(existsSync(f.extractions)).toBe(false);
      expect(existsSync(f.cached)).toBe(false);
      expect(existsSync(f.executed)).toBe(false);
    },
  );

  test("reuses a verified cached binary without another download", () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const downloads = readFileSync(f.downloads, "utf8");
    const result = f.run();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(f.cached);
    expect(readFileSync(f.downloads, "utf8")).toBe(downloads);
    expect(readFileSync(f.extractions, "utf8")).toBe("extract\n");
  });
});
