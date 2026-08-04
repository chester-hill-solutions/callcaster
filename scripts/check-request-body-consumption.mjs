#!/usr/bin/env node
/**
 * Static guard for Bun Request body-consumption hazards.
 *
 * Bun returns empty params if code consumes the original Request body and later
 * tries to validate/parse via request.clone(). Keep provider auth paths on one
 * body read: clone first, or pass already parsed params into the validator.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, "app", "routes", "api+"),
  path.join(ROOT, "app", "lib"),
  path.join(ROOT, "server"),
];
const SKIP = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\/archive\//];

const ORIGINAL_READ_RE =
  /\brequest\.(formData|json|text|arrayBuffer|blob)\s*\(/g;
const HAZARD_AFTER_READ_RE =
  /\brequest\.clone\s*\(|\b(requireTwilioSignature|validateTwilioWebhook|parseActionRequest|safeParseJson)\s*\(\s*request\b/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const rel = path.relative(ROOT, full);
      if (!SKIP.some((re) => re.test(rel))) out.push(full);
    }
  }
  return out;
}

function lineNumber(src, index) {
  return src.slice(0, index).split("\n").length;
}

function blankComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));
}

function nextScopeBoundary(src, index) {
  const rest = src.slice(index);
  const match = /\n\s*(export\s+)?(async\s+)?function\s+|\n\s*export\s+const\s+\w+\s*=|\n\s*(const|let|var)\s+\w+\s*=/.exec(rest);
  return match ? index + match.index : src.length;
}

const findings = [];
for (const file of SCAN_DIRS.flatMap((dir) => walk(dir))) {
  const rawSrc = fs.readFileSync(file, "utf8");
  if (rawSrc.includes("@allow-request-body-consume")) continue;
  const src = blankComments(rawSrc);

  ORIGINAL_READ_RE.lastIndex = 0;
  let readMatch;
  while ((readMatch = ORIGINAL_READ_RE.exec(src))) {
    const boundary = nextScopeBoundary(src, readMatch.index + readMatch[0].length);
    const after = src.slice(readMatch.index + readMatch[0].length, boundary);
    HAZARD_AFTER_READ_RE.lastIndex = 0;
    const hazardMatch = HAZARD_AFTER_READ_RE.exec(after);
    if (!hazardMatch) continue;

    findings.push({
      file: path.relative(ROOT, file),
      readLine: lineNumber(src, readMatch.index),
      hazardLine: lineNumber(src, readMatch.index + readMatch[0].length + hazardMatch.index),
      read: readMatch[0],
      hazard: hazardMatch[0],
    });
    break;
  }
}

if (findings.length) {
  console.error("Request body-consumption guard FAILED:\n");
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.readLine} reads ${finding.read}; later ${finding.hazard} at line ${finding.hazardLine}`,
    );
  }
  console.error(
    "\nUse request.clone().formData()/json() before peeking, or pass parsed params into signature validation.",
  );
  process.exit(1);
}

console.log("Request body-consumption guard passed.");
