#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { routeSourceFiles, checkRedirectTargets } from "./lib/redirect-targets.mjs";

const root = process.cwd();
const fixtureFlag = process.argv.indexOf("--routes-json");
let routes;
if (fixtureFlag !== -1) {
  const fixture = process.argv[fixtureFlag + 1];
  if (!fixture) throw new Error("--routes-json requires a registered route tree file");
  routes = JSON.parse(fs.readFileSync(fixture, "utf8"));
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "redirect-routes-"));
  const output = path.join(directory, "routes.json");
  const fd = fs.openSync(output, "w");
  try {
    // A file descriptor keeps the CLI's explicit exit from truncating piped output.
    execFileSync("npx", ["--no-install", "react-router", "routes", "--json"], {
      cwd: root, stdio: ["ignore", fd, "pipe"],
    });
    routes = JSON.parse(fs.readFileSync(output, "utf8"));
  } finally {
    fs.closeSync(fd);
    fs.rmSync(directory, { recursive: true });
  }
}
const result = checkRedirectTargets(routes, routeSourceFiles(routes, root));
if (result.failures.length) {
  console.error("Redirect-target check FAILED — local literal paths are absent from the registered route tree:");
  for (const hit of result.failures) console.error(`${path.relative(root, hit.file)}:${hit.line} ${hit.target}`);
  process.exitCode = 1;
} else {
  console.log(`Redirect-target check passed: ${result.checked} literal local targets; ${result.dynamic} runtime targets and ${result.external} external/other references remain unchecked.`);
}
