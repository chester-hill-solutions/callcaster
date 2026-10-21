import { afterEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const script = "scripts/check-unscoped-db-imports.mjs";
const baseline = "scripts/baselines/unscoped-db-imports.txt";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "unscoped-import-guard-"));
  roots.push(root);
  mkdirSync(join(root, "app/lib"), { recursive: true });
  mkdirSync(join(root, "scripts/baselines"), { recursive: true });
  copyFileSync(resolve(script), join(root, script));
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, baseline), "");
  return root;
}

function run(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

function source(root: string, text: string, extension = "ts") {
  writeFileSync(join(root, `app/lib/probe.${extension}`), text);
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("unscoped database import guard CLI", () => {
  it.each(
    ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"].flatMap(
      (extension) =>
        ["@/server/db", "@/server/admin-db"].map((module) => ({
          extension,
          module,
        })),
    ),
  )("rejects $module in a new .$extension module", ({ extension, module }) => {
    const root = fixture();
    source(root, `import * as client from "${module}";`, extension);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain(`app/lib/probe.${extension}::${module}`);
  });

  it.each([
    'import "@/server/db";',
    'export { adminDb } from "@/server/admin-db";',
    'export * from "@/server/db";',
    'const client = import(/* split across comments */ "@/server/db");',
    "const client = import(`@/server/db`);",
    'const client = import(("@/server/db"));',
    'const client = require("@/server/db");',
    "const client = require(`@/server/db`);",
    'const client = require(("@/server/db"));',
    'import client = require("@/server/db");',
    'type Client = typeof import("@/server/db");',
  ])("rejects a statically named module dependency: %s", (text) => {
    const root = fixture();
    source(root, text);
    expect(run(root).status).toBe(1);
  });

  it.each([
    '// import { db } from "@/server/db";\nexport const example = true;',
    '/* const client = import("@/server/admin-db"); */',
    "const example = 'import { db } from \"@/server/db\"';",
    'const example = `import("@/server/admin-db")`;',
    'import { createTenantDb } from "@/server/tenant-db";',
  ])("allows comments, string samples and the scoped client: %s", (text) => {
    const root = fixture();
    source(root, text);
    expect(run(root).status).toBe(0);
  });

  it("rewrites counted debt and then accepts the exact count", () => {
    const root = fixture();
    source(
      root,
      'import { db } from "@/server/db";\nconst client = require("@/server/db");',
    );
    expect(run(root, "--baseline").status).toBe(0);
    expect(readFileSync(join(root, baseline), "utf8")).toBe(
      "app/lib/probe.ts::@/server/db\t2\n",
    );
    expect(run(root).status).toBe(0);
  });

  it("rejects a second occurrence in an already baselined file", () => {
    const root = fixture();
    source(root, 'import { db } from "@/server/db";');
    writeFileSync(join(root, baseline), "app/lib/probe.ts::@/server/db\t1\n");
    expect(run(root).status).toBe(0);
    source(
      root,
      'import { db } from "@/server/db";\nconst client = require("@/server/db");',
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain("current 2, permitted 1");
  });

  it.each([0, 1])(
    "rejects stale debt after the count falls from 2 to %i",
    (count) => {
      const root = fixture();
      source(
        root,
        'import { db } from "@/server/db";\nconst client = require("@/server/db");',
      );
      writeFileSync(join(root, baseline), "app/lib/probe.ts::@/server/db\t2\n");
      expect(run(root).status).toBe(0);
      source(
        root,
        count
          ? 'import { db } from "@/server/db";'
          : "export const fixed = true;",
      );
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.output).toContain(`current ${count}, permitted 2`);
      expect(result.output).toContain(
        "node scripts/check-unscoped-db-imports.mjs --baseline",
      );
      expect(run(root, "--baseline").status).toBe(0);
      expect(run(root).status).toBe(0);
    },
  );

  it.each(["missing count", "0", "-1", "1.5", "01"])(
    "rejects malformed baseline count %s",
    (count) => {
      const root = fixture();
      writeFileSync(
        join(root, baseline),
        `app/lib/probe.ts::@/server/db\t${count}\n`,
      );
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.output).toContain("Invalid baseline entry");
    },
  );

  it("rejects duplicate baseline keys", () => {
    const root = fixture();
    source(
      root,
      'import { db } from "@/server/db";\nconst client = require("@/server/db");',
    );
    writeFileSync(
      join(root, baseline),
      "app/lib/probe.ts::@/server/db\t1\napp/lib/probe.ts::@/server/db\t2\n",
    );
    expect(run(root).status).toBe(1);
  });

  it("applies the fixture root to scanning, reading and rewriting without changing the repository baseline", () => {
    const root = fixture();
    const target = fixture();
    const repositoryBefore = readFileSync(resolve(baseline), "utf8");
    const scriptRootBefore = readFileSync(join(root, baseline), "utf8");
    source(target, 'import { adminDb } from "@/server/admin-db";', "js");
    expect(run(root, `--root=${target}`).status).toBe(1);
    expect(run(root, `--root=${target}`, "--baseline").status).toBe(0);
    expect(readFileSync(join(target, baseline), "utf8")).toBe(
      "app/lib/probe.js::@/server/admin-db\t1\n",
    );
    expect(run(root, `--root=${target}`).status).toBe(0);
    expect(readFileSync(join(root, baseline), "utf8")).toBe(scriptRootBefore);
    expect(readFileSync(resolve(baseline), "utf8")).toBe(repositoryBefore);
  });

  it.each(["--root=", "--root", "--unexpected"])(
    "rejects invalid option %s before rewriting",
    (option) => {
      const root = fixture();
      source(root, 'import { db } from "@/server/db";');
      const before = readFileSync(join(root, baseline), "utf8");
      expect(run(root, option, "--baseline").status).toBe(1);
      expect(readFileSync(join(root, baseline), "utf8")).toBe(before);
    },
  );
});
