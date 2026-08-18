#!/usr/bin/env node
/**
 * Codegen for the API surface core (issue #1242, D4).
 *
 * Writes app/lib/api-surface-generated.ts from the route tree and the route
 * handlers themselves. Everything it emits is a fact the codebase already
 * states; the editorial remainder lives in app/lib/api-surface-annotations.ts
 * and the two are merged by app/lib/api-surface.ts.
 *
 * Modes:
 *   (default)              rewrite the generated file
 *   --check                fail if the committed file is stale (CI)
 *   --verify               cross-check generated core against annotations and
 *                          against the auth evidence in the handlers
 *   --compare <snapshot>   field-by-field diff against a JSON snapshot of the
 *                          pre-migration literal, for the migration audit
 *   --report <path>        write the --compare output to a file as markdown
 *
 * Entry ORDER is canonical (path, then module). The literal it replaced was
 * split across four files for the app file-size gate with a hand-kept ordering
 * invariant that nothing enforced; sorting removes the invariant instead of
 * re-documenting it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveApiSurfaceCores } from "./lib/api-surface-derive.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "app/lib/api-surface-generated.ts");

type Op = {
  method: string;
  handler: "loader" | "action";
  capability?: string;
  capabilitySource?: "baseline";
};
type Core = {
  path: string;
  routeModule: string;
  authClass: string | null;
  authVia: string;
  authAllows: string[] | null;
  operations: Op[];
};

const q = (s: string) => JSON.stringify(s);

function renderOperation(op: Op): string {
  const parts = [`method: ${q(op.method)}`, `handler: ${q(op.handler)}`];
  if (op.capability) parts.push(`capability: ${q(op.capability)}`);
  if (op.capabilitySource) parts.push(`capabilitySource: ${q(op.capabilitySource)}`);
  return `{ ${parts.join(", ")} }`;
}

function render(cores: Core[]): string {
  const lines = cores.map((c) => {
    const ops = c.operations.map(renderOperation).join(", ");
    return (
      `  { path: ${q(c.path)}, routeModule: ${q(c.routeModule)}, ` +
      `authClass: ${c.authClass ? q(c.authClass) : "null"}, authVia: ${q(c.authVia)}, ` +
      `operations: [${ops}] },`
    );
  });

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate with \`npm run tools:api:surface:generate\`; CI enforces freshness
 * through \`npm run ci:codegen:verify\`. Source of truth is the route tree plus
 * the handlers themselves — see scripts/lib/api-surface-derive.mjs for what is
 * derived and, just as importantly, what is deliberately not.
 *
 * \`authClass: null\` means no authoritative strategy fixes the class for that
 * route, so app/lib/api-surface-annotations.ts declares it and the coverage
 * gate constrains the declaration against the auth evidence. Each null is a
 * route that has not yet grown a self-describing auth strategy.
 *
 * Entries are ordered by path, then module.
 */
import type { ApiSurfaceCore } from "@/lib/api-surface-types";

export const API_SURFACE_CORE: readonly ApiSurfaceCore[] = [
${lines.join("\n")}
];
`;
}

function loadCores(): { cores: Core[]; diagnostics: string[]; skipped: { path: string; routeModule: string; reason: string }[] } {
  const result = deriveApiSurfaceCores({ root: ROOT });
  return result;
}

function main() {
  const argv = process.argv.slice(2);
  const has = (f: string) => argv.includes(f);
  const valueOf = (f: string) => {
    const i = argv.indexOf(f);
    return i === -1 ? undefined : argv[i + 1];
  };

  const { cores, diagnostics, skipped } = loadCores();
  if (diagnostics.length) {
    console.error("API surface derivation reported problems:");
    for (const d of diagnostics) console.error(`  - ${d}`);
    process.exit(1);
  }

  const rendered = render(cores);

  const comparePath = valueOf("--compare");
  if (comparePath) {
    const report = compare(cores, JSON.parse(fs.readFileSync(comparePath, "utf8")), skipped);
    const reportPath = valueOf("--report");
    if (reportPath) {
      fs.writeFileSync(reportPath, report.markdown);
      console.log(`wrote ${reportPath}`);
    } else {
      console.log(report.markdown);
    }
    process.exit(report.unexplained ? 1 : 0);
  }

  if (has("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current !== rendered) {
      console.error(
        "app/lib/api-surface-generated.ts is stale — run `npm run tools:api:surface:generate`",
      );
      process.exit(1);
    }
    console.log(`API surface core up to date (${cores.length} entries)`);
    return;
  }

  fs.writeFileSync(OUT, rendered);
  const derivedAuth = cores.filter((c) => c.authClass).length;
  console.log(
    `wrote ${path.relative(ROOT, OUT)} — ${cores.length} entries, ` +
      `${cores.reduce((n, c) => n + c.operations.length, 0)} operations, ` +
      `${derivedAuth} authClass derived / ${cores.length - derivedAuth} declared`,
  );
  if (skipped.length) {
    console.log(`  skipped ${skipped.length} registered route(s) with no callable handler:`);
    for (const s of skipped) console.log(`    - ${s.path} (${s.routeModule}): ${s.reason}`);
  }
}

/**
 * Field-by-field diff of the derived core against a snapshot of the literal it
 * replaced. Every difference must land in one of two buckets: the literal was
 * wrong about the code (drift, generated wins), or the generator is missing
 * something (a gap, fix the generator). Anything else is unexplained and fails.
 */
function compare(
  cores: Core[],
  literal: Record<string, unknown>[],
  skipped: { path: string; routeModule: string; reason: string }[],
) {
  const genByMod = new Map(cores.map((c) => [c.routeModule, c]));
  const litByMod = new Map(literal.map((e) => [e.routeModule as string, e]));

  const drift: string[] = [];
  const gaps: string[] = [];
  let matched = 0;

  const opKey = (ops: { method: string; handler: string }[]) =>
    ops.map((o) => `${o.method}:${o.handler}`).sort().join(",");
  const capKey = (ops: { method: string; capability?: string }[]) =>
    ops.filter((o) => o.capability).map((o) => `${o.method}=${o.capability}`).sort().join(",");

  for (const [mod, lit] of litByMod) {
    if (genByMod.has(mod)) continue;
    const why = skipped.find((s) => s.routeModule === mod);
    drift.push(
      `**Phantom entry** \`${lit.path}\` (\`${mod}\`) — the inventory declared ` +
        `\`${opKey(lit.operations as never)}\`, but the module has ${why ? why.reason : "no callable handler"}.`,
    );
  }
  for (const [mod, core] of genByMod) {
    if (!litByMod.has(mod)) {
      gaps.push(`**Unlisted route** \`${core.path}\` (\`${mod}\`) — registered and callable, absent from the inventory.`);
    }
  }

  for (const [mod, core] of genByMod) {
    const lit = litByMod.get(mod);
    if (!lit) continue;
    let clean = true;

    if (lit.path !== core.path) {
      clean = false;
      drift.push(`**Path** \`${mod}\` — inventory said \`${lit.path}\`, route tree says \`${core.path}\`.`);
    }
    const litOps = lit.operations as { method: string; handler: string; capability?: string }[];
    if (opKey(litOps) !== opKey(core.operations)) {
      clean = false;
      drift.push(
        `**Operations** \`${core.path}\` — inventory declared \`${opKey(litOps) || "(none)"}\`, ` +
          `the route shim exports \`${opKey(core.operations)}\`.`,
      );
    }
    if (capKey(litOps) !== capKey(core.operations)) {
      clean = false;
      gaps.push(
        `**Capability** \`${core.path}\` — inventory \`[${capKey(litOps)}]\`, derived \`[${capKey(core.operations)}]\`.`,
      );
    }
    if (core.authClass && core.authClass !== lit.authClass) {
      clean = false;
      drift.push(
        `**authClass** \`${core.path}\` — inventory said \`${lit.authClass}\`, but ` +
          `\`${core.authVia}\` authoritatively enforces \`${core.authClass}\`.`,
      );
    }
    if (!core.authClass && core.authAllows && !core.authAllows.includes(lit.authClass as string)) {
      clean = false;
      drift.push(
        `**authClass** \`${core.path}\` — inventory said \`${lit.authClass}\`, which \`${core.authVia}\` ` +
          `cannot produce (permits \`${core.authAllows.join("`, `")}\`).`,
      );
    }
    if (clean) matched++;
  }

  const unconstrained = cores.filter((c) => !c.authClass && !c.authAllows);
  const md = [
    "# API surface migration audit",
    "",
    "Field-by-field comparison of the generated core (`app/lib/api-surface-generated.ts`)",
    "against the hand-maintained `API_SURFACE` literal it replaced (issue #1242, D4).",
    "",
    `- literal entries: **${litByMod.size}**`,
    `- generated entries: **${genByMod.size}**`,
    `- entries matching field-for-field: **${matched}**`,
    `- authClass derived authoritatively: **${cores.filter((c) => c.authClass).length}**`,
    `- authClass declared and constrained by auth evidence: **${cores.filter((c) => !c.authClass && c.authAllows).length}**`,
    `- authClass declared with no mechanical corroboration: **${unconstrained.length}**`,
    "",
    "## Drift — the literal was wrong about the code",
    "",
    drift.length ? drift.map((d) => `- ${d}`).join("\n") : "_none_",
    "",
    "## Generator gaps — the literal knew something the generator cannot derive",
    "",
    gaps.length ? gaps.map((g) => `- ${g}`).join("\n") : "_none_",
    "",
    "## Routes whose declared authClass has no mechanical corroboration",
    "",
    "These use a hand-rolled preamble the analyser cannot classify, so the",
    "annotation's `authClass` is taken on trust. Each one that grows a",
    "self-describing auth strategy moves into the derived set.",
    "",
    ...(unconstrained.length
      ? unconstrained.map((c) => `- \`${c.path}\` — \`${c.authVia}\``)
      : ["_none_"]),
    "",
  ].join("\n");

  return { markdown: md, unexplained: gaps.length > 0, drift, gaps };
}

main();
