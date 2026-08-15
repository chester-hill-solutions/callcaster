/**
 * D2 (issue #1242) — the capability cross-check in `check:handlers`.
 *
 * `scripts/lib/capability-linkage.mjs` is a pure `analyze()` over a repo root,
 * so every case here builds a throwaway tree in a temp dir and calls it
 * directly — no child process, no snapshotting of the real surface. The last
 * describe block runs it against the real tree with the committed baseline,
 * which is the assertion that this PR did not ship a red gate.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// Plain .mjs gate helper — tsconfig excludes *.test.ts, so no shim is needed.
import { analyzeCapabilityLinkage } from "../scripts/lib/capability-linkage.mjs";

const CAPABILITIES_TS = `export const PRODUCT_CAPABILITIES = {
  "campaigns.read": "Read",
  "campaigns.write": "Write",
  "audit.read": "Audit",
} as const;
`;

type Fixture = {
  /** Contents of the generated api-surface-generated.ts core. */
  surface: string;
  /** repo-relative path -> file contents. */
  files: Record<string, string>;
};

let root: string;

function build({ surface, files }: Fixture) {
  writeFile("app/lib/capabilities.ts", CAPABILITIES_TS);
  writeFile("app/lib/api-surface-generated.ts", surface);
  for (const [rel, contents] of Object.entries(files)) writeFile(rel, contents);
}

function writeFile(rel: string, contents: string) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function analyze(baseline: Record<string, string> = {}) {
  return analyzeCapabilityLinkage({ root, baseline }) as {
    violations: string[];
    linked: Array<{ key: string; capability: string }>;
    unlinkedDeclared: Array<{ key: string; declared: string }>;
    suggestedBaseline: Record<string, string>;
    stats: Record<string, number>;
  };
}

/**
 * One entry, one GET loader operation, at /api/thing — in the shape
 * scripts/generate-api-surface.ts emits, which is what the linkage reads
 * since D4 folded the four hand-written surface files into one generated core.
 */
function surfaceWith(capability: string | null, routeModule = "app/routes/api+/thing.route.tsx") {
  const cap = capability ? `, capability: "${capability}"` : "";
  return `import type { ApiSurfaceCore } from "@/lib/api-surface-types";

export const API_SURFACE_CORE: readonly ApiSurfaceCore[] = [
  { path: "/api/thing", routeModule: "${routeModule}", authClass: "session", authVia: "loader:test", operations: [{ method: "GET", handler: "loader"${cap} }] },
];
`;
}

const LINKED_LOADER = (capability: string) => `import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("${capability}"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => auth,
});
`;

const PREAMBLE_LOADER = (capability: string) => `import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: async ({ params, context }) => {
    const auth = getDataPlaneRouteContext(context, params.workspaceId);
    const gated = await requireDataPlaneCapability(auth, "${capability}");
    if (gated instanceof Response) return gated;
    return auth;
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => auth,
});
`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "capability-linkage-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("linkage: strategy call site vs API_SURFACE", () => {
  test("a matching declaration passes and is reported as linked", () => {
    build({
      surface: surfaceWith("campaigns.read"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": LINKED_LOADER("campaigns.read"),
      },
    });

    const result = analyze();
    expect(result.violations).toEqual([]);
    expect(result.linked).toEqual([
      expect.objectContaining({ key: "GET /api/thing", capability: "campaigns.read" }),
    ]);
  });

  test("declared X while the strategy enforces Y fails, and no baseline can hide it", () => {
    build({
      surface: surfaceWith("campaigns.write"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": LINKED_LOADER("campaigns.read"),
      },
    });

    const linkage = analyze().violations.filter((v) => v.startsWith("GET /api/thing"));
    expect(linkage).toHaveLength(1);
    expect(linkage[0]).toContain('enforces "campaigns.read"');
    expect(linkage[0]).toContain('declares "campaigns.write"');

    // The baseline only grandfathers *unlinked* declarations — trying to
    // silence a strategy mismatch with one keeps the violation and adds a
    // stale-entry complaint on top.
    const withBaseline = analyze({ "GET /api/thing": "campaigns.write" }).violations;
    expect(withBaseline).toEqual(expect.arrayContaining(linkage));
    expect(withBaseline.join("\n")).toContain("no longer applies");
  });

  test("a strategy with no declaration at all fails", () => {
    build({
      surface: surfaceWith(null),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": LINKED_LOADER("campaigns.read"),
      },
    });

    expect(analyze().violations.join("\n")).toContain("declares no capability");
  });

  test("defineDataPlaneListLoader carries the capability too", () => {
    build({
      surface: surfaceWith("campaigns.read"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": `import { defineDataPlaneListLoader } from "@/lib/capability-guard.server";

export const loader = defineDataPlaneListLoader({
  capability: "campaigns.read",
  key: "things",
  list: async () => ({ ok: true as const, things: [] }),
});
`,
      },
    });

    expect(analyze().violations).toEqual([]);
    expect(analyze().stats.linked).toBe(1);
  });

  test("a module-scope alias to a strategy still counts as linked", () => {
    build({
      surface: surfaceWith("campaigns.read"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": `import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

const readGate = dataPlaneCapabilityAuth("campaigns.read");

export const loader = defineLoader({
  auth: readGate,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => auth,
});
`,
      },
    });

    expect(analyze().violations).toEqual([]);
  });
});

describe("linkage: the baseline is a ratchet", () => {
  const preambleFixture: Fixture = {
    surface: surfaceWith("campaigns.read"),
    files: {
      "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
      "app/routes/api+/thing.loader.server.ts": PREAMBLE_LOADER("campaigns.read"),
    },
  };

  test("a hand-rolled preamble fails without a baseline entry", () => {
    build(preambleFixture);
    const violations = analyze().violations;
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("nothing links the declaration to enforcement");
  });

  test("and passes with one", () => {
    build(preambleFixture);
    expect(analyze({ "GET /api/thing": "campaigns.read" }).violations).toEqual([]);
    expect(analyze().suggestedBaseline).toEqual({ "GET /api/thing": "campaigns.read" });
  });

  test("changing a grandfathered capability fails until the baseline is regenerated", () => {
    build({
      ...preambleFixture,
      surface: surfaceWith("campaigns.write"),
      files: {
        ...preambleFixture.files,
        "app/routes/api+/thing.loader.server.ts": PREAMBLE_LOADER("campaigns.write"),
      },
    });

    const violations = analyze({ "GET /api/thing": "campaigns.read" }).violations;
    expect(violations.join("\n")).toContain("baseline grandfathers");
  });

  test("a baseline entry that no longer applies fails — the ratchet only goes down", () => {
    build({
      surface: surfaceWith("campaigns.read"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": LINKED_LOADER("campaigns.read"),
      },
    });

    const violations = analyze({ "GET /api/thing": "campaigns.read" }).violations;
    expect(violations.join("\n")).toContain("no longer applies");
  });
});

describe("truthfulness: never baselined, covers preambles too", () => {
  test("a capability enforced but declared nowhere fails", () => {
    build({
      surface: surfaceWith(null),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": PREAMBLE_LOADER("audit.read"),
      },
    });

    const violations = analyze({ "GET /api/thing": "audit.read" }).violations;
    expect(violations.join("\n")).toContain('handler enforces "audit.read"');
  });

  test("a declared capability the handler module never references fails", () => {
    build({
      surface: surfaceWith("audit.read"),
      files: {
        "app/routes/api+/thing.route.tsx": `export { loader } from "./thing.loader.server";\n`,
        "app/routes/api+/thing.loader.server.ts": `import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async () => null,
});
`,
      },
    });

    const violations = analyze({ "GET /api/thing": "audit.read" }).violations;
    expect(violations.join("\n")).toContain("no handler module for this route references it");
  });

  test("an unresolvable handler module is reported, not silently skipped", () => {
    build({
      surface: surfaceWith("campaigns.read", "app/routes/api+/missing.route.tsx"),
      files: {},
    });

    expect(analyze().violations.join("\n")).toContain(
      "no module defining `loader` could be resolved",
    );
  });
});

describe("the real tree", () => {
  test("passes with the committed baseline", async () => {
    const { readFileSync } = await import("node:fs");
    const repoRoot = join(import.meta.dirname, "..");
    const baseline = JSON.parse(
      readFileSync(join(repoRoot, "scripts", "capability-baseline.json"), "utf8"),
    );
    const result = analyzeCapabilityLinkage({ root: repoRoot, baseline }) as {
      violations: string[];
      stats: Record<string, number>;
    };

    expect(result.violations).toEqual([]);
    expect(result.stats.linked).toBeGreaterThan(0);
  });
});

describe("runtime: the brand the gate reads statically", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("a capability strategy brands itself and the factory propagates it", async () => {
    vi.doMock("@/server/db", () => ({ db: {}, directPool: {} }));
    vi.doMock("@/lib/database/workspace.server", () => ({
      getUserRole: vi.fn(),
      requireWorkspaceAccess: vi.fn(),
    }));

    const { capabilityOf, defineLoader } = await import("@/lib/handler.server");
    const { dataPlaneCapabilityAuth, dataPlaneCapabilityAuthWithParam } = await import(
      "@/lib/capability-guard.server"
    );

    expect(capabilityOf(dataPlaneCapabilityAuth("campaigns.read"))).toBe("campaigns.read");
    expect(
      capabilityOf(dataPlaneCapabilityAuthWithParam("campaigns.write", "audienceId")),
    ).toBe("campaigns.write");

    const loader = defineLoader({
      auth: dataPlaneCapabilityAuth("audit.read"),
      sideEffects: ["db-read"],
      handler: async ({ auth }) => auth,
    });
    expect(capabilityOf(loader)).toBe("audit.read");
  });

  test("a handler with no capability strategy carries no brand", async () => {
    const { capabilityOf, defineLoader } = await import("@/lib/handler.server");

    expect(
      capabilityOf(
        defineLoader({
          auth: () => ({ workspaceId: "w" }),
          sideEffects: ["db-read"],
          handler: async ({ auth }) => auth,
        }),
      ),
    ).toBeUndefined();
    expect(capabilityOf(undefined)).toBeUndefined();
    expect(capabilityOf("campaigns.read")).toBeUndefined();
  });
});
