import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const appRequire = createRequire(join(process.cwd(), "package.json"));
let directory: string;

function header(name: string, type: string, size: number) {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100);
  for (const [offset, value] of [[100, 420], [108, 0], [116, 0], [136, 0]]) {
    block.write(value.toString(8).padStart(7, "0") + "\0", offset, 8);
  }
  block.write(size.toString(8).padStart(11, "0") + "\0", 124, 12);
  block.fill(32, 148, 156);
  block.write(type, 156, 1);
  block.write("ustar\0", 257, 6);
  block.write("00", 263, 2);
  const checksum = block.reduce((sum, byte) => sum + byte, 0);
  block.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return block;
}

function archive(path: string, entries: Buffer[]) {
  writeFileSync(join(directory, path), gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "callcaster-tar-selection-"));
  const longName = Buffer.from("a/".repeat(15000) + "file.txt\0");
  archive("long.tar.gz", [
    header("././@LongLink", "L", longName.length),
    longName,
    Buffer.alloc((512 - longName.length % 512) % 512),
    header("placeholder", "0", 0),
  ]);
  archive("normal.tar.gz", [header("file.txt", "0", 0)]);
  archive("nested.tar.gz", [
    header("keep/nested.txt", "0", 0),
    header("other.txt", "0", 0),
  ]);
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

for (const consumer of ["giget", "node-gyp", "pacote"]) {
  describe(`tar resolved by ${consumer}`, () => {
    function list(file: string, members: string[] | null) {
      const entry = appRequire.resolve(consumer);
      const code = `
        const { createRequire } = require("node:module");
        const tar = createRequire(${JSON.stringify(entry)})("tar");
        const entries = [];
        (async () => {
          await tar.t({ file: ${JSON.stringify(join(directory, file))},
            onReadEntry: entry => entries.push(entry.path) }
            ${members ? ", " + JSON.stringify(members) : ""});
          console.log(JSON.stringify(entries));
        })().catch(error => { console.error(error); process.exitCode = 2; });
      `;
      const result = spawnSync(process.execPath, ["-e", code], {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout.trim());
    }

    it("completes selected-member listing for a GNU long path", () => {
      expect(list("long.tar.gz", ["file.txt"])).toEqual([]);
    });

    it("still reads the long entry without member selection", () => {
      expect(list("long.tar.gz", null)).toEqual(["a/".repeat(15000) + "file.txt"]);
    });

    it("lists a selected normal file", () => {
      expect(list("normal.tar.gz", ["file.txt"])).toEqual(["file.txt"]);
    });

    it("includes selected directory children and excludes other files", () => {
      expect(list("nested.tar.gz", ["keep"])).toEqual(["keep/nested.txt"]);
    });
  });
}
