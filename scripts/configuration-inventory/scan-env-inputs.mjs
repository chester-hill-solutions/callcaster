import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".md",
  ".yml", ".yaml", ".sh", ".toml", ".mk",
]);

const TEXT_FILENAMES = new Set([
  "Dockerfile", "Dockerfile.worker", "Makefile", "railway.toml", "railway.json",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git", ".cache", ".opencode", "build", "coverage", "graphify-out",
  "node_modules", "public", "vendor", "dist", ".react-router", "archive",
]);

const ROOTS = [
  "app", "server", "worker", "services", "scripts", "e2e", "test",
  ".railway", ".github/workflows", ".env.example", "package.json",
  ".github/actions", "drizzle.config.ts", "vite.config.ts", "Dockerfile",
  "Dockerfile.worker", "Makefile", "docker-compose.dev.yml", "railway.toml",
  "railway.worker.toml", "railway.json",
];

export function normalizeRailwayServiceName(name) {
  const normalized = name.trim().toLowerCase();
  if (normalized === "app" || normalized === "callcaster") return "app";
  if (normalized === "worker" || normalized === "callcaster-worker") return "worker";
  if (normalized === "database" || /^(?:postgres|postgresql)(?:[-\s].*)?$/.test(normalized)) return "database";
  return name;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function consumerFor(sourceFile) {
  if (sourceFile.startsWith(".github/")) return "ci";
  if (sourceFile.startsWith(".railway/")) return "railway";
  if (sourceFile.startsWith("e2e/sim/")) return "sim";
  if (sourceFile.startsWith("e2e/")) return "e2e";
  if (sourceFile.startsWith("scripts/")) return "script";
  if (sourceFile.startsWith("worker/")) return "worker";
  if (sourceFile.startsWith("services/")) return "media-stream";
  if (sourceFile.startsWith("test/")) return "test";
  if (/^Dockerfile(?:\.|$)/.test(path.basename(sourceFile))) return "container";
  return "app";
}

function environmentFor(sourceFile) {
  const match = sourceFile.match(/\.railway\/environments\/([^/]+)\./);
  if (match) return match[1];
  if (sourceFile === ".env.example") return "local";
  return "shared";
}

function sourceKindForRead(sourceFile) {
  if (/^Dockerfile(?:\.|$)/.test(path.basename(sourceFile))) return "container-env-read";
  if (sourceFile.startsWith("test/")) return "test-input";
  if (sourceFile.startsWith("scripts/") || sourceFile.startsWith("e2e/")) return "script-input";
  return "runtime-read";
}

function entry({ key = null, sourceKind, sourceFile, line, consumer, usage = "read", enabled = true, expression, service, notes }) {
  return {
    key,
    sourceKind,
    sourceFile,
    line,
    consumer,
    environment: environmentFor(sourceFile),
    usage,
    enabled,
    ...(expression ? { expression } : {}),
    ...(service ? { service } : {}),
    requiredness: "unknown",
    valueRedacted: true,
    classification: "unclassified",
    owner: "unassigned",
    migrationTarget: "unassigned",
    ...(notes ? { notes } : {}),
  };
}

function collectKnownStringArrays(text) {
  const values = new Map();
  const pattern = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g;
  for (const match of text.matchAll(pattern)) {
    const keys = [...match[2].matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map((m) => m[1]);
    if (keys.length) values.set(match[1], keys);
  }
  return values;
}

export function scanSourceText(text, sourceFile) {
  const records = [];
  const consumer = consumerFor(sourceFile);
  const knownArrays = collectKnownStringArrays(text);
  const seen = new Set();
  const add = (record) => {
    const identity = JSON.stringify(record);
    if (!seen.has(identity)) {
      seen.add(identity);
      records.push(record);
    }
  };

  if (sourceFile !== ".env.example" && (/^(?:docs|examples)\//.test(sourceFile) || /(?:^|\/)(?:README|CHANGELOG)(?:\.|$)/i.test(sourceFile))) return records;

  if (!sourceFile.startsWith(".github/workflows/")) {
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)(?![A-Z0-9_])(?!\s*(?:\?\?=|=))/g)) {
    const key = match[1];
    add(entry({
      key,
      sourceKind: sourceKindForRead(sourceFile),
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
    }));
  }

  for (const match of text.matchAll(/(?:process\.env\.([A-Z][A-Z0-9_]*)|process\.env\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])\s*(?:\?\?=|=)/g)) {
    const key = match[1] ?? match[2];
    add(entry({
      key,
      sourceKind: sourceKindForRead(sourceFile),
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
      usage: "write",
    }));
  }

  for (const match of text.matchAll(/delete\s+process\.env(?:\.([A-Z][A-Z0-9_]*)|\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g)) {
    const key = match[1] ?? match[2];
    add(entry({
      key,
      sourceKind: sourceKindForRead(sourceFile),
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
      usage: "delete",
    }));
  }

  for (const match of text.matchAll(/process\.env\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\](?!\s*(?:\?\?=|=))/g)) {
    add(entry({
      key: match[1],
      sourceKind: sourceKindForRead(sourceFile),
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
    }));
  }
  }

  if (!sourceFile.startsWith(".github/workflows/")) for (const match of text.matchAll(/process\.env\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
    const keys = knownArrays.get(match[1]);
    const inferredEntry = [...knownArrays.entries()].find(([arrayName]) =>
      text.includes(`${arrayName}.some`) &&
      text.includes(`process.env[${match[1]}]`),
    );
    const inferredKeys = inferredEntry?.[1];
    if (keys?.length || inferredKeys?.length) {
      for (const key of keys ?? inferredKeys) {
        add(entry({
          key,
          sourceKind: sourceKindForRead(sourceFile),
          sourceFile,
          line: lineNumberAt(text, match.index),
          consumer,
          notes: keys
            ? `Resolved from the ${match[1]} key list.`
            : `Resolved from the ${inferredEntry[0]} key list.`,
        }));
      }
    } else {
      add(entry({
        sourceKind: sourceFile.startsWith("test/") ? "dynamic-test-read" : "dynamic-runtime-read",
        sourceFile,
        line: lineNumberAt(text, match.index),
        consumer,
        expression: `process.env[${match[1]}]`,
        notes: `Dynamic key expression: ${match[1]}. Manual key review is required.`,
      }));
    }
  }

  if (sourceFile.startsWith("scripts/") || sourceFile.startsWith("e2e/")) {
    for (const match of text.matchAll(/(?:process\.argv|args|argv|flagValue|argValue)[^\n]{0,100}?["'](--[a-z][a-z0-9-]*)["']/g)) {
      add(entry({
        key: match[1],
        sourceKind: "cli-flag",
        sourceFile,
        line: lineNumberAt(text, match.index),
        consumer: "script",
        usage: "declaration",
        expression: match[1],
        notes: "Command-line option declared by a script.",
      }));
    }
  }

  for (const match of text.matchAll(/dotenv\.config\s*\(\s*(?:\{\s*path:\s*)?['"]([^'"]+)['"]/g)) {
    add(entry({
      sourceKind: "dotenv-load",
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
      usage: "loader",
      notes: `Loaded dotenv path or reference: ${match[1]}.`,
    }));
  }

  for (const match of text.matchAll(/["']dotenv\/config["']/g)) {
    add(entry({
      sourceKind: "dotenv-load",
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
      usage: "loader",
      notes: "Loads the default dotenv file set.",
    }));
  }

  for (const match of text.matchAll(/(?:--env-file=|--env-file\s+)([^\s'"`]+)/g)) {
    add(entry({
      sourceKind: "dotenv-load",
      sourceFile,
      line: lineNumberAt(text, match.index),
      consumer,
      notes: `Command-line environment file: ${match[1]}.`,
    }));
  }

  if (sourceFile === ".env.example") {
    for (const [index, line] of text.split("\n").entries()) {
      const match = line.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=/);
      if (match) {
        add(entry({
          key: match[2],
          sourceKind: "env-example",
          sourceFile,
          line: index + 1,
          consumer: "local-tooling",
          usage: "declaration",
          enabled: !match[1],
          notes: "Key name collected; example value was not collected.",
        }));
      }
    }
  }

  if (sourceFile.startsWith(".railway/")) {
    const matchingClose = (openIndex, open, close) => {
      let depth = 0; let quote = null; let lineComment = false; let blockComment = false;
      for (let index = openIndex; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        if (lineComment) { if (character === "\n") lineComment = false; continue; }
        if (blockComment) { if (character === "*" && next === "/") { blockComment = false; index += 1; } continue; }
        if (quote) { if (character === quote && text[index - 1] !== "\\") quote = null; continue; }
        if (character === "/" && next === "/") { lineComment = true; index += 1; continue; }
        if (character === "/" && next === "*") { blockComment = true; index += 1; continue; }
        if (character === "\"" || character === "'") { quote = character; continue; }
        if (character === open) depth += 1;
        if (character === close && --depth === 0) return index;
      }
      return text.length - 1;
    };
    const serviceRanges = [...text.matchAll(/(?:service|postgres)\(\s*["']([^"']+)["']\s*,\s*\{/g)].map((match) => {
      const open = text.indexOf("{", match.index);
      return { name: normalizeRailwayServiceName(match[1]), start: match.index, end: matchingClose(open, "{", "}") };
    });
    const variableArrays = [...text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g)].map((match) => {
      const open = text.indexOf("[", match.index); const end = matchingClose(open, "[", "]");
      const preservedUse = text.indexOf(`preservedVariables(${match[1]})`, match.index);
      const owner = serviceRanges.find((range) => preservedUse >= range.start && preservedUse <= range.end)?.name;
      return { start: open, end, owner };
    });
    for (const array of variableArrays) for (const match of text.slice(array.start, array.end + 1).matchAll(/["']([A-Z][A-Z0-9_]*)["']/g)) add(entry({
      key: match[1], sourceKind: "railway-variable", sourceFile,
      line: lineNumberAt(text, array.start + match.index), consumer, usage: "deployment",
      ...(array.owner ? { service: array.owner } : {}),
      notes: "Railway variable name collected; value is preserved and not read.",
    }));
    for (const range of serviceRanges) for (const env of text.slice(range.start, range.end + 1).matchAll(/\benv\s*:\s*\{/g)) {
      const envStart = range.start + env.index + env[0].lastIndexOf("{"); const envEnd = matchingClose(envStart, "{", "}");
      for (const key of text.slice(envStart, envEnd + 1).matchAll(/(?:^|[\n,])\s*([A-Z][A-Z0-9_]*)\s*:/g)) add(entry({
        key: key[1], sourceKind: "railway-variable", sourceFile, line: lineNumberAt(text, envStart + key.index), consumer,
        usage: "deployment", service: range.name, notes: "Railway environment declaration; value was not collected.",
      }));
    }
  }

  if (/^Dockerfile(?:\.|$)/.test(path.basename(sourceFile))) {
    for (const match of text.matchAll(/^\s*ENV\s+([A-Z][A-Z0-9_]*)\s*(?:=|\s)/gm)) {
      add(entry({ key: match[1], sourceKind: "container-env", sourceFile, line: lineNumberAt(text, match.index), consumer: "container", usage: "deployment" }));
    }
  }

  if (/^(?:docker-compose|compose).*\.(?:ya?ml)$/.test(path.basename(sourceFile))) {
    let environmentIndent = null;
    for (const [index, line] of text.split("\n").entries()) {
      const indent = line.match(/^\s*/)[0].length;
      if (/^\s*environment:\s*$/.test(line)) {
        environmentIndent = indent;
        continue;
      }
      if (environmentIndent !== null && line.trim() && indent <= environmentIndent) environmentIndent = null;
      if (environmentIndent === null) continue;
      const block = line.match(/^\s*(?:-\s*)?([A-Z][A-Z0-9_]*)\s*(?::|=)/);
      if (block) add(entry({ key: block[1], sourceKind: "compose-environment", sourceFile, line: index + 1, consumer: "local-compose", usage: "deployment" }));
    }
  }

  if (sourceFile === "Makefile" || sourceFile.endsWith(".mk")) {
    for (const match of text.matchAll(/\$\(([A-Z][A-Z0-9_]*)\)|\$\{([A-Z][A-Z0-9_]*)\}/g)) {
      add(entry({ key: match[1] ?? match[2], sourceKind: "make-variable", sourceFile, line: lineNumberAt(text, match.index), consumer: "script", usage: "read" }));
    }
  }

  if (/\.sh$/.test(sourceFile)) {
    for (const match of text.matchAll(/\bexport\s+([A-Z][A-Z0-9_]*)(?:\s*=|\b)/g)) {
      add(entry({ key: match[1], sourceKind: "shell-environment", sourceFile, line: lineNumberAt(text, match.index), consumer: "script", usage: "read" }));
    }
    for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::[-+?=])/g)) {
      add(entry({ key: match[1], sourceKind: "shell-environment", sourceFile, line: lineNumberAt(text, match.index), consumer: "script", usage: "read" }));
    }
  }

  if (sourceFile.startsWith(".github/workflows/")) {
    for (const match of text.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)) {
      add(entry({
        key: match[1],
        sourceKind: "github-secret",
        sourceFile,
        line: lineNumberAt(text, match.index),
        consumer,
        usage: "deployment",
        notes: "GitHub secret name collected; secret value was not accessed.",
      }));
    }
    for (const match of text.matchAll(/(?:vars|github\.repository_owner)\.([A-Z][A-Z0-9_]*)/g)) {
      add(entry({ key: match[1], sourceKind: "github-variable", sourceFile, line: lineNumberAt(text, match.index), consumer, usage: "declaration", notes: "GitHub variable name collected; value was not accessed." }));
    }

    let envIndent = null;
    for (const [index, line] of text.split("\n").entries()) {
      const indent = line.match(/^\s*/)[0].length;
      if (/^\s*env:\s*$/.test(line)) {
        envIndent = indent;
        continue;
      }
      if (envIndent !== null && line.trim() && indent <= envIndent) envIndent = null;
      if (envIndent !== null) {
        const key = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*:/)?.[1];
        if (key) add(entry({
          key,
          sourceKind: "github-workflow-env",
          sourceFile,
          line: index + 1,
          consumer,
          usage: "declaration",
          notes: "Workflow environment key collected; value was not accessed.",
        }));
      }
      for (const match of line.matchAll(/env:\s*\{[^}]*\b([A-Z][A-Z0-9_]*)\s*:/g)) {
        add(entry({
          key: match[1],
          sourceKind: "github-workflow-env",
          sourceFile,
          line: index + 1,
          consumer,
          usage: "declaration",
          notes: "Inline workflow environment key collected; value was not accessed.",
        }));
      }
    }
  }

  return records;
}

async function filesUnder(root, relativePath) {
  const absolute = path.join(root, relativePath);
  const fileStat = await stat(absolute);
  if (fileStat.isFile()) return [relativePath];
  const result = [];
  for (const name of await readdir(absolute, { withFileTypes: true })) {
    if (name.isDirectory() && IGNORED_DIRECTORIES.has(name.name)) continue;
    const child = path.join(relativePath, name.name);
    if (name.isDirectory()) result.push(...await filesUnder(root, child));
    else if (TEXT_EXTENSIONS.has(path.extname(name.name)) || name.name === ".env.example" || TEXT_FILENAMES.has(name.name)) result.push(child);
  }
  return result;
}

export async function collectSourceFiles(root) {
  const files = [];
  for (const source of ROOTS) {
    try { files.push(...await filesUnder(root, source)); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const name of await readdir(root)) {
    if (/^(?:docker-compose|compose).*\.(?:ya?ml)$/.test(name) || /^railway.*\.(?:toml|json)$/.test(name)) {
      files.push(name);
    }
  }
  return [...new Set(files)].sort();
}

export async function scanRepository(root) {
  const records = [];
  for (const sourceFile of await collectSourceFiles(root)) {
    const text = await readFile(path.join(root, sourceFile), "utf8");
    records.push(...scanSourceText(text, sourceFile));
  }
  return records.sort((a, b) =>
    a.sourceFile.localeCompare(b.sourceFile) || a.line - b.line || (a.key ?? "").localeCompare(b.key ?? "") || a.sourceKind.localeCompare(b.sourceKind),
  );
}

export function redactRecord(record) {
  return { ...record, valueRedacted: true };
}

export function summarizeInventory(records) {
  const byKey = new Map();
  for (const record of records) {
    if (record.sourceKind === "cli-flag" || record.sourceKind === "make-variable") continue;
    if (!record.key) continue;
    const current = byKey.get(record.key) ?? {
      key: record.key,
      sourceKinds: new Set(),
      consumers: new Set(),
      environments: new Set(),
      usages: new Set(),
      sourceCount: 0,
      dynamic: false,
      classification: "unclassified",
      owner: "unassigned",
      migrationTarget: "unassigned",
    };
    current.sourceKinds.add(record.sourceKind);
    current.consumers.add(record.consumer);
    current.environments.add(record.environment);
    current.usages.add(record.usage);
    current.sourceCount += 1;
    current.dynamic ||= record.notes?.startsWith("Resolved from") === true;
    byKey.set(record.key, current);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)).map((summary) => ({
    ...summary,
    sourceKinds: [...summary.sourceKinds].sort(),
    consumers: [...summary.consumers].sort(),
    environments: [...summary.environments].sort(),
    usages: [...summary.usages].sort(),
  }));
}

export async function writeInventory(root, records, outputRoot = path.join(root, "docs/generated")) {
  const outputDir = outputRoot.endsWith("docs/generated") ? outputRoot : path.join(outputRoot, "docs/generated");
  await mkdir(outputDir, { recursive: true });
  const operational = records.filter((record) => record.sourceKind === "cli-flag" || record.sourceKind === "make-variable").map(redactRecord);
  const testInputs = records.filter((record) => record.sourceKind === "test-input" || record.sourceKind === "dynamic-test-read").map(redactRecord);
  const redacted = records.filter((record) => !["cli-flag", "make-variable", "test-input", "dynamic-test-read"].includes(record.sourceKind)).map(redactRecord);
  const summaries = summarizeInventory(redacted);
  const scannedRoots = [...ROOTS].sort();
  const scannedFiles = await collectSourceFiles(root);
  const provenance = {
    generator: "tools:config:inventory",
    recordDigest: createHash("sha256").update(JSON.stringify(records.map(redactRecord))).digest("hex"),
    scannedRoots,
    scannedFiles,
  };
  const metadata = { version: 2, generatedBy: "tools:config:inventory", provenance };
  await writeFile(path.join(outputDir, "configuration-inventory.json"), `${JSON.stringify({ ...metadata, entries: redacted }, null, 2)}\n`);
  const keyCount = new Set(redacted.filter((r) => r.key).map((r) => r.key)).size;
  const dynamicCount = redacted.filter((r) => r.sourceKind === "dynamic-runtime-read" || r.sourceKind === "dynamic-test-read").length;
  const byKind = Object.fromEntries([...new Set(redacted.map((r) => r.sourceKind))].sort().map((kind) => [kind, redacted.filter((r) => r.sourceKind === kind).length]));
  const lines = [
    "# Configuration input inventory",
    "",
    "> Generated by `npm run tools:config:inventory`. Values are never collected.",
    "> Classification and ownership remain intentionally unassigned for ADR-0040 Phase 0.",
    `> Provenance: \`${provenance.recordDigest}\``,
    "",
    `- ${redacted.length} source records`,
    `- ${keyCount} distinct key names`,
    `- ${dynamicCount} unresolved dynamic reads`,
    "",
    "## Source kinds",
    "",
    ...Object.entries(byKind).map(([kind, count]) => `- \`${kind}\`: ${count}`),
    "",
    "## Records",
    "",
    "| Key | Kind | Usage | Environment | Source | Line | Consumer | Classification | Owner | Migration target | Notes |",
    "|---|---|---|---|---|---:|---|---|---|---|---|",
    ...redacted.map((r) => `| ${r.key ?? "(dynamic)"} | ${r.sourceKind} | ${r.usage} | ${r.environment} | \`${r.sourceFile}\` | ${r.line} | ${r.consumer} | ${r.classification} | ${r.owner} | ${r.migrationTarget} | ${(r.notes ?? "").replaceAll("|", "\\|")} |`),
    ];
  await writeFile(path.join(outputDir, "configuration-inventory.md"), `${lines.join("\n")}\n`);
  await writeFile(path.join(outputDir, "configuration-key-summary.json"), `${JSON.stringify({ ...metadata, keys: summaries }, null, 2)}\n`);
  const summaryLines = [
    "# Configuration key summary",
    "",
    "> Generated by `npm run tools:config:inventory`. Values are never collected.",
    "> Classification and ownership remain intentionally unassigned for ADR-0040 Phase 0.",
    `> Provenance: \`${provenance.recordDigest}\``,
    "",
    "| Key | Source kinds | Consumers | Environments | Usages | Sources | Classification | Owner | Migration target |",
    "|---|---|---|---|---|---:|---|---|---|",
    ...summaries.map((r) => `| ${r.key} | ${r.sourceKinds.join(", ")} | ${r.consumers.join(", ")} | ${r.environments.join(", ")} | ${r.usages.join(", ")} | ${r.sourceCount} | ${r.classification} | ${r.owner} | ${r.migrationTarget} |`),
  ];
  await writeFile(path.join(outputDir, "configuration-key-summary.md"), `${summaryLines.join("\n")}\n`);
  const dynamic = redacted.filter((record) => record.sourceKind === "dynamic-runtime-read" || record.sourceKind === "dynamic-test-read");
  await writeFile(path.join(outputDir, "configuration-dynamic-read-review.json"), `${JSON.stringify({ ...metadata, reads: dynamic.map((record) => ({ sourceFile: record.sourceFile, line: record.line, consumer: record.consumer, sourceKind: record.sourceKind, expression: record.expression ?? record.notes, status: "needs-review" })) }, null, 2)}\n`);
  const dynamicLines = [
    "# Dynamic environment read review",
    "",
    "> Generated by `npm run tools:config:inventory`. Each row requires manual review.",
    `> Provenance: \`${provenance.recordDigest}\``,
    "",
    "| Source | Line | Consumer | Kind | Expression | Status |",
    "|---|---:|---|---|---|---|",
    ...dynamic.map((record) => `| \`${record.sourceFile}\` | ${record.line} | ${record.consumer} | ${record.sourceKind} | ${(record.expression ?? record.notes ?? "").replaceAll("|", "\\|")} | needs-review |`),
  ];
  await writeFile(path.join(outputDir, "configuration-dynamic-read-review.md"), `${dynamicLines.join("\n")}\n`);
  const testMetadata = {
    version: 2,
    generatedBy: "tools:config:test-source-input-observations",
    report: "test-source-input-observations",
    description: "Observations of configuration inputs found in test source files. A key may also be listed in the runtime catalog.",
    provenance,
  };
  await writeFile(path.join(outputDir, "test-configuration-inputs.json"), `${JSON.stringify({ ...testMetadata, entries: testInputs }, null, 2)}\n`);
  const testLines = [
    "# Test-source configuration input observations",
    "",
    "> Generated by `npm run tools:config:inventory`. These are observations from test source files; a key may also be listed in the runtime catalog. Values are never collected.",
    `> Provenance: \`${provenance.recordDigest}\``,
    "",
    "| Key | Kind | Usage | Source | Line | Expression | Notes |",
    "|---|---|---|---|---:|---|---|",
    ...testInputs.map((record) => `| ${record.key ?? "(dynamic)"} | ${record.sourceKind} | ${record.usage} | \`${record.sourceFile}\` | ${record.line} | ${(record.expression ?? "").replaceAll("|", "\\|")} | ${(record.notes ?? "").replaceAll("|", "\\|")} |`),
  ];
  await writeFile(path.join(outputDir, "test-configuration-inputs.md"), `${testLines.join("\n")}\n`);
  const operationalMetadata = { version: 1, generatedBy: "tools:config:operational-inputs", provenance };
  await writeFile(path.join(outputDir, "operational-inputs.json"), `${JSON.stringify({ ...operationalMetadata, entries: operational }, null, 2)}\n`);
  const operationalLines = ["# Operational inputs", "", "> Generated by `npm run tools:config:inventory`. These are command-line and Make inputs, not environment keys.", `> Provenance: \`${provenance.recordDigest}\``, "", "| Input | Kind | Source | Line | Consumer | Notes |", "|---|---|---|---:|---|---|", ...operational.map((record) => `| ${record.key} | ${record.sourceKind} | \`${record.sourceFile}\` | ${record.line} | ${record.consumer} | ${(record.notes ?? "").replaceAll("|", "\\|")} |`)];
  await writeFile(path.join(outputDir, "operational-inputs.md"), `${operationalLines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const records = await scanRepository(root);
  await writeInventory(root, records);
  console.log(`Configuration inventory: ${records.length} records, ${new Set(records.filter((r) => r.key).map((r) => r.key)).size} keys, ${records.filter((r) => r.sourceKind === "dynamic-runtime-read" || r.sourceKind === "dynamic-test-read").length} dynamic reads`);
}
