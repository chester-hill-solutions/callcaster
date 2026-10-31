#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gatePhases } from "./lib/local-gate-plan.mjs";
import { runGatePhases } from "./lib/local-gate-runner.mjs";

const ROOT = join(import.meta.dirname, "..");
const active = new Set();
let interrupted = 0;
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function stop(signal) {
  interrupted = signal === "SIGINT" ? 130 : 143;
  for (const child of active) {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") console.error(error.message);
    }
  }
}

function runCheck(script, logDir) {
  const started = performance.now();
  const logFile = join(logDir, `${script.replaceAll(":", "-")}.log`);
  const fd = openSync(logFile, "w");
  console.log(`[start] ${script}`);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        process.execPath,
        [process.env.npm_execpath, "run", script],
        {
          cwd: ROOT,
          stdio: ["ignore", fd, fd],
          detached: process.platform !== "win32",
        },
      );
    } finally {
      closeSync(fd);
    }
    active.add(child);
    let error;
    child.on("error", (cause) => {
      error = cause;
    });
    child.on("close", (code, signal) => {
      active.delete(child);
      const ms = performance.now() - started;
      console.log(
        `[${code === 0 ? "pass" : "FAIL"}] ${script} (${seconds(ms)})`,
      );
      if (code !== 0) {
        console.error(
          readFileSync(logFile, "utf8").split("\n").slice(-80).join("\n"),
        );
        console.error(`Full log: ${logFile}`);
        if (signal) console.error(`Stopped by ${signal}`);
      }
      resolve({ script, code: code ?? 1, ms, logFile, error });
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      fast: { type: "boolean", default: false },
      full: { type: "boolean", default: false },
      jobs: { type: "string", default: "2" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      "npm run ci:local [-- --jobs=1..4]\nnpm run ci:local:full [-- --jobs=1..4]\nLocal checks default to fast; CI runs full validation. --full adds tests, build, bundle and codegen checks in sequence.",
    );
    return;
  }
  if (values.fast && values.full)
    throw new Error("Use either --fast or --full");
  const fast = !values.full;
  const jobs = Number(values.jobs);
  if (!/^[1-4]$/.test(values.jobs))
    throw new Error("--jobs must be an integer from 1 to 4");
  if (!process.env.npm_execpath)
    throw new Error(
      "Start the gate with npm run ci:local or npm run ci:local:full",
    );
  const cacheDir = join(ROOT, "node_modules", ".cache", "local-gates");
  mkdirSync(cacheDir, { recursive: true });
  const logDir = mkdtempSync(join(cacheDir, "run-"));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const started = performance.now();
  console.log(
    `Local ${fast ? "fast" : "full"} gate; up to ${jobs} guard checks at once.\nLogs: ${logDir}`,
  );
  if (fast)
    console.log(
      "Local checks before a push. CI runs the full suites, build, bundle and codegen. Optional full local run: npm run ci:local:full.",
    );
  const results = await runGatePhases(gatePhases(fast), {
    jobs,
    run: (script) => runCheck(script, logDir),
    shouldStop: () => interrupted !== 0,
  });
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  const failure = results.find((result) => result.code !== 0);
  process.exitCode = interrupted || failure?.code || 0;
  console.log(
    `\n${process.exitCode ? "FAILED" : "PASSED"}: ${results.length} checks in ${seconds(performance.now() - started)}.`,
  );
  if (failure?.error) console.error(failure.error.message);
  console.log("Longest checks:");
  for (const result of [...results].sort((a, b) => b.ms - a.ms).slice(0, 5)) {
    console.log(`  ${result.script}: ${seconds(result.ms)}`);
  }
}

main().catch((error) => {
  console.error(`Local gate: ${error.message}`);
  process.exitCode = 1;
});
