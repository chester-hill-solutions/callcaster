#!/usr/bin/env node
/**
 * Fail if built client assets reference obvious server-only modules/secrets.
 * Run after: npm run build
 */
import fs from "node:fs";
import path from "node:path";

const BUILD_CLIENT = path.join(process.cwd(), "build", "client");
const FORBIDDEN = [
  "SUPABASE_SERVICE_KEY",
  "env.server",
  "twilio-webhook.server",
  "throughput-config.server",
  "twilio-sender-class.server",
  "merge-workspace-twilio-data.server",
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(js|css|map)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const hits = [];
for (const file of walk(BUILD_CLIENT)) {
  if (/manifest-[a-f0-9]+\.js$/i.test(file)) {
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      hits.push({ file: path.relative(process.cwd(), file), needle });
    }
  }
}

if (hits.length) {
  console.error("Client bundle may include server-only references:\n");
  for (const h of hits) {
    console.error(`  ${h.file}: ${h.needle}`);
  }
  process.exit(1);
}

console.log("Client bundle check passed (no forbidden server strings found).");
