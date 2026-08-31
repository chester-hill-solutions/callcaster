#!/usr/bin/env node
/**
 * Relative-redirect gate (ratcheting list).
 *
 * `redirect("../…")` and `redirect("./…")` in a server loader/action are
 * resolved by the browser against `request.url`, which turned a "successful
 * upload → back to list" flow into a 404 for the audios routes (#1396,
 * fixed in #1413). Route-relative resolution follows RFC 3986: the last
 * URL segment is stripped before the reference is appended, so
 * `redirect("../audios")` from `/workspaces/$id/audios/new` resolves to
 * `/workspaces/$id/audios` — but `redirect("../")` from the same URL
 * resolves to `/workspaces/$id/`. Both are easy to get wrong on refactor.
 *
 * The safe pattern in this repo is an absolute URL built from the
 * workspaceId/campaignId/etc. that's already in scope in the auth or
 * loader args. This gate freezes the current list of route-relative
 * redirects in `scripts/baselines/relative-redirects.json` and fails CI
 * on any NEW one. Migrating an existing entry to an absolute URL and
 * running `npm run tools:relative-redirects:baseline` ratchets the list
 * DOWN.
 *
 * Usage:
 *   node scripts/check-relative-redirects.mjs              # fail on regression
 *   node scripts/check-relative-redirects.mjs --update     # ratchet baseline
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = path.join(ROOT, "app", "routes");
const BASELINE_PATH = path.join(
  ROOT,
  "scripts",
  "baselines",
  "relative-redirects.json",
);

// Only server-side route files ship server redirects. The `.tsx` route
// module also does (rare `<Redirect />` server usage), but Response-level
// `redirect(...)` from `react-router` lives in the `.action.server.ts`
// and `.loader.server.ts` files.
const FILE_MATCH = /\.(action|loader)\.server\.ts$/;

// Match `redirect("…")` / `redirect('…')` / `redirect(\`…\`)` where the
// first argument starts with `.` (relative path). Excludes calls where
// the first argument is a variable — we can't statically decide those
// and the false-positive rate is low enough that a runtime bug would
// still show up in e2e.
const REDIRECT_RE = /\bredirect\s*\(\s*(?:throw\s+)?["'`](\.[^"'`]*)["'`]/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (FILE_MATCH.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function collect() {
  const hits = [];
  for (const file of walk(SCAN_ROOT)) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      const match = line.match(REDIRECT_RE);
      if (match) {
        hits.push({ file: rel, line: i + 1, target: match[1] });
      }
    }
  }
  hits.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
  return hits;
}

const current = collect();

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ allowed: current }, null, 2) + "\n",
  );
  console.log(
    `Relative-redirect baseline written: ${current.length} allowed entrie(s).`,
  );
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
  : { allowed: [] };
const allowed = new Set(
  (baseline.allowed ?? []).map((e) => `${e.file}:${e.line}:${e.target}`),
);
const seen = new Set(current.map((e) => `${e.file}:${e.line}:${e.target}`));

const regressions = current.filter(
  (e) => !allowed.has(`${e.file}:${e.line}:${e.target}`),
);

if (regressions.length) {
  console.error(
    "Relative-redirect gate FAILED — new route-relative `redirect(\"…\")` call(s):",
  );
  console.error("");
  for (const r of regressions) {
    console.error(`  ${r.file}:${r.line}  redirect("${r.target}")`);
  }
  console.error(
    "\nRoute-relative redirects in loaders/actions resolve against `request.url`\n" +
      "per RFC 3986 (the last URL segment is stripped before the reference is\n" +
      "appended), so refactors that move a file up or down the URL tree\n" +
      "silently reroute it. Prefer an absolute URL built from the auth\n" +
      "context (workspaceId, campaignId, etc.):\n" +
      '\n' +
      '  return redirect(`/workspaces/${workspaceId}/audios?uploaded=1`, { headers });\n' +
      "\n" +
      "See #1396 / #1413 for the flow this gate protects. To ratchet DOWN\n" +
      "after removing an existing entry, run `npm run tools:relative-redirects:baseline`.",
  );
  process.exit(1);
}

// Detect drift: baseline entries that no longer exist (either the line
// moved or the redirect was fixed). Prompt the operator to ratchet down.
const stale = [...allowed].filter((k) => !seen.has(k));
if (stale.length) {
  console.log(
    `Relative-redirect gate passed: ${current.length} allowed (${stale.length} baseline entrie(s) no longer present — run \`npm run tools:relative-redirects:baseline\` to ratchet).`,
  );
  process.exit(0);
}

console.log(
  `Relative-redirect gate passed: ${current.length} allowed at baseline.`,
);
