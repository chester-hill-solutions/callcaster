#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const moves = [
  [
    "app/components/settings/MessageSettings.tsx",
    "app/components/campaign/settings/MessageSettings.tsx",
  ],
  [
    "app/components/settings/Settings.VoxTypeSelector.tsx",
    "app/components/campaign/settings/VoxTypeSelector.tsx",
  ],
];

for (const [from, to] of moves) {
  const src = path.join(ROOT, from);
  const dest = path.join(ROOT, to);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let content = fs.readFileSync(src, "utf8");
  if (to.includes("VoxTypeSelector")) {
    content = content.replace(
      /Settings\.VoxTypeSelector/g,
      "VoxTypeSelector",
    );
  }
  fs.writeFileSync(dest, content);
  fs.unlinkSync(src);
  console.log(`${from} -> ${to}`);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const replacements = [
  ["@/components/settings/MessageSettings", "@/components/campaign/settings/MessageSettings"],
  ["@/components/settings/Settings.VoxTypeSelector", "@/components/campaign/settings/VoxTypeSelector"],
];

let n = 0;
for (const file of [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "test"))]) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const [a, b] of replacements) src = src.split(a).join(b);
  if (src !== orig) {
    fs.writeFileSync(file, src);
    n++;
  }
}

try {
  fs.rmdirSync(path.join(ROOT, "app/components/settings"));
} catch {
  /* not empty or missing */
}

const barrel = path.join(ROOT, "app/components/MessageSettings.tsx");
if (fs.existsSync(barrel)) {
  fs.writeFileSync(
    barrel,
    'export { MessageSettings } from "@/components/campaign/settings/MessageSettings";\n',
  );
}

console.log(`updated ${n} import sites`);
