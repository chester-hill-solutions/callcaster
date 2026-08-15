/**
 * Capability linkage analysis — the data behind `check:handlers`' capability
 * cross-check (issue #1242, D2).
 *
 * A route does not get to *say* which product capability it enforces. The
 * capability-carrying auth strategies in app/lib/capability-guard.server.ts
 * (`dataPlaneCapabilityAuth`, `dataPlaneCapabilityAuthWithParam`,
 * `defineDataPlaneListLoader`) take the capability id as their argument and
 * hand that same value to `requireActorCapability`, so the strategy call site
 * IS the enforcement. This module reads that call site and cross-checks it
 * against the `capability` field on the matching API_SURFACE operation.
 *
 * Two independent checks, mirroring the bidirectional credit facet:
 *
 *  1. LINKAGE (per operation, ratcheted via a baseline)
 *     - handler auth is a capability-carrying strategy  → the operation's
 *       declared capability must be exactly the strategy's argument, in both
 *       directions (a wrong id and a missing id both fail).
 *     - operation declares a capability but the handler enforces it by hand
 *       (a preamble inside the auth function or the handler body) → the
 *       declaration is not mechanically linked to enforcement, so it needs a
 *       BASELINE entry. New routes cannot join the baseline; D3's preamble
 *       migration ratchets it toward zero.
 *
 *  2. TRUTHFULNESS (per route, never baselined)
 *     - every declared capability must actually appear in the module that
 *       defines the handler (no phantom declarations), and
 *     - every capability id the module references must be declared by at least
 *       one of the route's operations (no silently enforced capabilities).
 *     This dimension does not care HOW the capability is enforced, so it holds
 *     for the grandfathered preambles too.
 *
 * Pure + parameterised on `root` so the fixture suite can point it at a tiny
 * synthetic tree; see test/capability-linkage.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SURFACE_FILE = /^api-surface-.+\.ts$/;
/** Matches the seed(...) / platformSeed(...) entry blocks in the surface files. */
const SEED_BLOCK = /[a-zA-Z]*[Ss]eed\(\{[\s\S]*?\}\)\s*[,;]/g;

/** Auth-strategy constructors whose first argument IS the enforced capability. */
const LINKED_STRATEGIES = "dataPlaneCapabilityAuthWithParam|dataPlaneCapabilityAuth";

/** Read the product capability ids so the truthfulness scan can't guess. */
export function readCapabilityIds(root) {
  const src = readFileSync(join(root, "app", "lib", "capabilities.ts"), "utf8");
  const block = src.match(/PRODUCT_CAPABILITIES\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error("capabilities.ts: PRODUCT_CAPABILITIES not found");
  return new Set([...block[1].matchAll(/"([a-z][\w.]*)":/g)].map((m) => m[1]));
}

/** Parse every api-surface-*.ts entry into { path, routeModule, operations }. */
export function readSurfaceEntries(root) {
  const dir = join(root, "app", "lib");
  const entries = [];
  for (const file of readdirSync(dir).filter((f) => SURFACE_FILE.test(f)).sort()) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const block of source.match(SEED_BLOCK) ?? []) {
      const routeModule = block.match(/routeModule:\s*\n?\s*"([^"]+)"/)?.[1];
      const path = block.match(/path:\s*"([^"]+)"/)?.[1];
      if (!routeModule || !path) continue;
      const operations = [];
      const opsBlock = block.match(/operations:\s*\[([\s\S]*)\]/)?.[1];
      for (const op of opsBlock?.matchAll(/\{([\s\S]*?)\}/g) ?? []) {
        const method = op[1].match(/method:\s*"([^"]+)"/)?.[1];
        const handler = op[1].match(/handler:\s*"(loader|action)"/)?.[1];
        if (!method || !handler) continue;
        operations.push({
          method,
          handler,
          declared: op[1].match(/capability:\s*"([^"]+)"/)?.[1],
        });
      }
      entries.push({ surfaceFile: file, path, routeModule, operations });
    }
  }
  return entries;
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function resolveImportSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const ext of [".ts", ".tsx", ".server.ts", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) ? base : null;
}

/**
 * Follow `export { loader } from "./x"` re-exports to the module that actually
 * defines the handler. Route modules are thin barrels; enforcement lives in the
 * sibling `.loader.server.ts` / `.action.server.ts`.
 */
export function resolveHandlerModule(absRouteModule, name, depth = 0) {
  const src = readIfExists(absRouteModule);
  if (src === null || depth > 4) return null;
  const defines = new RegExp(
    `export\\s+(?:const|let|async\\s+function|function)\\s+${name}\\b`,
  );
  if (defines.test(src)) return absRouteModule;
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const exported = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop()?.trim())
      .filter(Boolean);
    if (!exported.includes(name)) continue;
    const target = resolveImportSpec(absRouteModule, m[2]);
    if (target) return resolveHandlerModule(target, name, depth + 1) ?? target;
  }
  return null;
}

/** Source slice from `export const <name> =` up to the next top-level export. */
function exportRegion(src, name) {
  const m = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=`));
  if (!m) return null;
  const from = src.slice(m.index);
  const next = from.slice(1).search(/\nexport\s/);
  return next === -1 ? from : from.slice(0, next + 1);
}

/**
 * The capability a handler enforces through a capability-carrying strategy, or
 * null when it is enforced by hand (or not at all).
 *
 * Three accepted shapes — all of them place the capability id at the strategy
 * call site, which is the value the guard passes to `requireActorCapability`:
 *   auth: dataPlaneCapabilityAuth("campaigns.read")
 *   auth: sharedStrategy            // const sharedStrategy = dataPlane...(...)
 *   export const loader = defineDataPlaneListLoader({ capability: "..." })
 */
export function linkedCapability(src, name) {
  const region = exportRegion(src, name);
  if (!region) return null;
  if (/=\s*defineDataPlaneListLoader\s*\(/.test(region)) {
    return region.match(/capability:\s*"([^"]+)"/)?.[1] ?? null;
  }
  const direct = region.match(
    new RegExp(`auth:\\s*(?:${LINKED_STRATEGIES})\\(\\s*"([^"]+)"`),
  );
  if (direct) return direct[1];
  const alias = region.match(/auth:\s*([A-Za-z_$][\w$]*)\s*,/)?.[1];
  if (alias) {
    const decl = src.match(
      new RegExp(
        `(?:const|let)\\s+${alias}\\s*=\\s*(?:${LINKED_STRATEGIES})\\(\\s*"([^"]+)"`,
      ),
    );
    if (decl) return decl[1];
  }
  return null;
}

/**
 * Every product capability id the module mentions. Deliberately blunt: any
 * occurrence of a real capability id in a route module is either an
 * enforcement argument or a lie, and both are worth surfacing.
 */
export function referencedCapabilities(src, capabilityIds) {
  const found = new Set();
  for (const m of src.matchAll(/"([a-z][\w.]*)"/g)) {
    if (capabilityIds.has(m[1])) found.add(m[1]);
  }
  return found;
}

export function operationKey(method, path) {
  return `${method} ${path}`;
}

/**
 * @param {{ root: string, baseline?: Record<string, string> }} args
 * @returns {{
 *   violations: string[],
 *   linked: Array<{ key: string, capability: string, module: string }>,
 *   unlinkedDeclared: Array<{ key: string, declared: string, module: string }>,
 *   suggestedBaseline: Record<string, string>,
 *   staleBaselineKeys: string[],
 *   stats: { operations: number, declared: number, linked: number, grandfathered: number },
 * }}
 */
export function analyzeCapabilityLinkage({ root, baseline = {} }) {
  const capabilityIds = readCapabilityIds(root);
  const entries = readSurfaceEntries(root);
  const violations = [];
  const linked = [];
  const unlinkedDeclared = [];
  const suggestedBaseline = {};
  const usedBaselineKeys = new Set();
  let operations = 0;
  let declaredCount = 0;

  for (const entry of entries) {
    const modules = new Map();
    const declaredForRoute = new Set();

    for (const op of entry.operations) {
      operations += 1;
      const key = operationKey(op.method, entry.path);
      if (op.declared) {
        declaredCount += 1;
        declaredForRoute.add(op.declared);
      }

      if (!modules.has(op.handler)) {
        modules.set(
          op.handler,
          resolveHandlerModule(join(root, entry.routeModule), op.handler),
        );
      }
      const module = modules.get(op.handler);
      if (!module) {
        if (op.declared) {
          violations.push(
            `${key}: declares "${op.declared}" but no module defining \`${op.handler}\` could be resolved from ${entry.routeModule}`,
          );
        }
        continue;
      }
      const rel = relative(root, module);
      const enforced = linkedCapability(readFileSync(module, "utf8"), op.handler);

      if (enforced) {
        linked.push({ key, capability: enforced, module: rel });
        if (op.declared !== enforced) {
          violations.push(
            `${key}: auth strategy enforces "${enforced}" but API_SURFACE declares ` +
              `${op.declared ? `"${op.declared}"` : "no capability"} (${rel})`,
          );
        }
        continue;
      }

      if (op.declared) {
        unlinkedDeclared.push({ key, declared: op.declared, module: rel });
        suggestedBaseline[key] = op.declared;
        if (baseline[key] === op.declared) {
          usedBaselineKeys.add(key);
        } else {
          violations.push(
            baseline[key]
              ? `${key}: declares "${op.declared}" but the capability baseline grandfathers "${baseline[key]}" — re-run the baseline tool after an intentional change`
              : `${key}: declares "${op.declared}" but nothing links the declaration to enforcement — use a capability-carrying auth strategy (dataPlaneCapabilityAuth) in ${rel}`,
          );
        }
      }
    }

    // Truthfulness: compare declarations against every capability the handler
    // modules reference, however they enforce it. Never baselined.
    const referenced = new Set();
    for (const module of modules.values()) {
      if (!module) continue;
      for (const cap of referencedCapabilities(
        readFileSync(module, "utf8"),
        capabilityIds,
      )) {
        referenced.add(cap);
      }
    }
    for (const declared of declaredForRoute) {
      if (!referenced.has(declared)) {
        violations.push(
          `${entry.path}: declares "${declared}" but no handler module for this route references it`,
        );
      }
    }
    for (const cap of referenced) {
      if (!declaredForRoute.has(cap)) {
        violations.push(
          `${entry.path}: handler enforces "${cap}" but no operation in API_SURFACE declares it (${entry.surfaceFile})`,
        );
      }
    }
  }

  const staleBaselineKeys = Object.keys(baseline)
    .filter((key) => !usedBaselineKeys.has(key))
    .sort();
  for (const key of staleBaselineKeys) {
    violations.push(
      `${key}: capability baseline entry no longer applies — remove it (the ratchet only goes down)`,
    );
  }

  return {
    violations,
    linked,
    unlinkedDeclared,
    suggestedBaseline: Object.fromEntries(Object.entries(suggestedBaseline).sort()),
    staleBaselineKeys,
    stats: {
      operations,
      declared: declaredCount,
      linked: linked.length,
      grandfathered: unlinkedDeclared.length,
    },
  };
}
