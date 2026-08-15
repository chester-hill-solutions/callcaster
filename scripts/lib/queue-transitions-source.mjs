/* eslint-env node */
/**
 * Read QUEUE_ENTRY_TRANSITIONS out of app/lib/queue-status.ts, from plain Node.
 *
 * The check script runs as `node scripts/...` in CI with no TypeScript runtime,
 * and queue-status.ts imports a type from @/lib/db-types, so neither a plain
 * `import` nor `--experimental-strip-types` can load it. Re-typing the
 * transition table here as a JS copy was the obvious alternative and is exactly
 * the failure this whole check exists to prevent — a second hand-maintained
 * copy of the same state machine, free to drift.
 *
 * So: extract it from the source text instead. Fragile on its own, which is why
 * `test/queue-rpc-contract.test.ts` imports the real TypeScript module and
 * asserts this extractor returns a deep-equal table. Refactor queue-status.ts
 * however you like — if the extraction stops matching, that test fails before
 * the gate can start silently checking against a stale table.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TRANSITIONS_SOURCE_FILE = "app/lib/queue-status.ts";
export const TRANSITIONS_EXPORT = "QUEUE_ENTRY_TRANSITIONS";

/** `export const NAME = "value" as const;` — the state-name constants. */
function collectStringConstants(src) {
  const out = new Map();
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*as\s+const\s*;/g;
  for (const m of src.matchAll(re)) out.set(m[1], m[2]);
  return out;
}

/** `const NAME[: type] = [ "a", "b" ]` — the shared column-set constants. */
function collectArrayConstants(src) {
  const out = new Map();
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g;
  for (const m of src.matchAll(re)) {
    out.set(
      m[1],
      [...m[2].matchAll(/"([^"]*)"/g)].map((s) => s[1]),
    );
  }
  return out;
}

/** Balanced `{...}` starting at the first brace at or after `from`. */
function sliceBraced(src, from) {
  const start = src.indexOf("{", from);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null;
}

/** Split top-level `key: {...}` entries out of an object body. */
function splitEntries(body) {
  const entries = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      entries.push(cur);
      cur = "";
    } else cur += ch;
  }
  entries.push(cur);
  return entries.map((e) => e.trim()).filter(Boolean);
}

/**
 * @returns {Record<string, {queueState: string, legalFrom: string[]|"any", columns: string[]}>}
 */
export function parseQueueEntryTransitions(source) {
  const strings = collectStringConstants(source);
  const arrays = collectArrayConstants(source);

  const resolveString = (token) => {
    const t = token.trim().replace(/,$/, "");
    const quoted = t.match(/^"([^"]*)"$/);
    if (quoted) return quoted[1];
    if (strings.has(t)) return strings.get(t);
    throw new Error(`queue-transitions-source: cannot resolve string value \`${t}\``);
  };
  const resolveList = (token) => {
    const t = token.trim().replace(/,$/, "");
    if (t === '"any"') return "any";
    if (t.startsWith("[")) {
      const inner = t.slice(1, t.lastIndexOf("]"));
      return inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(resolveString);
    }
    if (arrays.has(t)) return arrays.get(t);
    throw new Error(`queue-transitions-source: cannot resolve list value \`${t}\``);
  };

  const at = source.indexOf(`export const ${TRANSITIONS_EXPORT}`);
  if (at === -1) {
    throw new Error(
      `queue-transitions-source: ${TRANSITIONS_EXPORT} not found in ${TRANSITIONS_SOURCE_FILE}`,
    );
  }
  // Skip the `Record<...>` type annotation and land on the initializer brace.
  const eq = source.indexOf("=", at);
  const body = sliceBraced(source, eq);
  if (body === null) {
    throw new Error(`queue-transitions-source: ${TRANSITIONS_EXPORT} has no object initializer`);
  }

  const transitions = {};
  for (const entry of splitEntries(body)) {
    const head = entry.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (!head) continue;
    const inner = sliceBraced(entry, head[0].length - 1);
    if (inner === null) continue;
    const field = (name) => {
      const m = inner.match(new RegExp(`\\b${name}\\s*:\\s*([\\s\\S]*?)(?:,\\s*\\n|\\n\\s*\\})`));
      if (!m) throw new Error(`queue-transitions-source: ${head[1]} is missing \`${name}\``);
      return m[1];
    };
    transitions[head[1]] = {
      queueState: resolveString(field("queueState")),
      legalFrom: resolveList(field("legalFrom")),
      columns: resolveList(field("columns")),
    };
  }

  if (Object.keys(transitions).length === 0) {
    throw new Error(`queue-transitions-source: ${TRANSITIONS_EXPORT} parsed to zero transitions`);
  }
  return transitions;
}

export function loadQueueEntryTransitions(root, file = TRANSITIONS_SOURCE_FILE) {
  return parseQueueEntryTransitions(readFileSync(join(root, file), "utf8"));
}
