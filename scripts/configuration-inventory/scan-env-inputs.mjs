import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
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
  return "app";
}

function environmentFor(sourceFile) {
  const match = sourceFile.match(/\.railway\/environments\/([^/]+)\./);
  if (match) return match[1];
  if (sourceFile === ".env.example") return "local";
  return "shared";
}

function sourceKindForRead(sourceFile) {
  if (sourceFile.startsWith("test/")) return "test-input";
  if (sourceFile.startsWith("scripts/") || sourceFile.startsWith("e2e/")) return "script-input";
  return "runtime-read";
}

function entry({ key = null, sourceKind, sourceFile, line, consumer, usage = "read", notes }) {
  return {
    key,
    sourceKind,
    sourceFile,
    line,
    consumer,
    environment: environmentFor(sourceFile),
    usage,
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
        notes: `Dynamic key expression: ${match[1]}. Manual key review is required.`,
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
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (match) {
        add(entry({
          key: match[1],
          sourceKind: "env-example",
          sourceFile,
          line: index + 1,
          consumer: "local-tooling",
          usage: "declaration",
          notes: "Key name collected; example value was not collected.",
        }));
      }
    }
  }

  if (sourceFile.startsWith(".railway/")) {
    for (const match of text.matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)) {
      add(entry({
        key: match[1],
        sourceKind: "railway-variable",
        sourceFile,
        line: lineNumberAt(text, match.index),
        consumer,
        usage: "deployment",
        notes: "Railway variable name collected; value is preserved and not read.",
      }));
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

export async function writeInventory(root, records) {
  const outputDir = path.join(root, "docs/generated");
  await mkdir(outputDir, { recursive: true });
  const redacted = records.map(redactRecord);
  const summaries = summarizeInventory(redacted);
  await writeFile(path.join(outputDir, "configuration-inventory.json"), `${JSON.stringify({ version: 1, generatedBy: "tools:config:inventory", entries: redacted }, null, 2)}\n`);
  const keyCount = new Set(redacted.filter((r) => r.key).map((r) => r.key)).size;
  const dynamicCount = redacted.filter((r) => r.sourceKind === "dynamic-runtime-read" || r.sourceKind === "dynamic-test-read").length;
  const byKind = Object.fromEntries([...new Set(redacted.map((r) => r.sourceKind))].sort().map((kind) => [kind, redacted.filter((r) => r.sourceKind === kind).length]));
  const lines = [
    "# Configuration input inventory",
    "",
    "> Generated by `npm run tools:config:inventory`. Values are never collected.",
    "> Classification and ownership remain intentionally unassigned for ADR-0040 Phase 0.",
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
  await writeFile(path.join(outputDir, "configuration-key-summary.json"), `${JSON.stringify({ version: 1, generatedBy: "tools:config:inventory", keys: summaries }, null, 2)}\n`);
  const summaryLines = [
    "# Configuration key summary",
    "",
    "> Generated by `npm run tools:config:inventory`. Values are never collected.",
    "> Classification and ownership remain intentionally unassigned for ADR-0040 Phase 0.",
    "",
    "| Key | Source kinds | Consumers | Environments | Usages | Sources | Classification | Owner | Migration target |",
    "|---|---|---|---|---|---:|---|---|---|",
    ...summaries.map((r) => `| ${r.key} | ${r.sourceKinds.join(", ")} | ${r.consumers.join(", ")} | ${r.environments.join(", ")} | ${r.usages.join(", ")} | ${r.sourceCount} | ${r.classification} | ${r.owner} | ${r.migrationTarget} |`),
  ];
  await writeFile(path.join(outputDir, "configuration-key-summary.md"), `${summaryLines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const records = await scanRepository(root);
  await writeInventory(root, records);
  console.log(`Configuration inventory: ${records.length} records, ${new Set(records.filter((r) => r.key).map((r) => r.key)).size} keys, ${records.filter((r) => !r.key).length} dynamic reads`);
}
