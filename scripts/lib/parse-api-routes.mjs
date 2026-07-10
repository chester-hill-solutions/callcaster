#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROUTE_OPEN =
  /<Route(?:\s+index)?(?:\s+path="([^"]*)")?\s+file="([^"]+)"/;
const ROUTE_CLOSE = /<\/Route>/;

/**
 * Parse `react-router routes` output into full `/api/...` paths with route modules.
 * @param {{ cwd?: string }} [opts]
 * @returns {{ path: string, routeModule: string }[]}
 */
export function parseApiRoutesFromReactRouter(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  // Redirect to a file instead of capturing the pipe: the react-router CLI can
  // exit before its stdout pipe flushes, silently truncating output at 8KB.
  const tmpFile = path.join(os.tmpdir(), `api-routes-${process.pid}.txt`);
  let out = "";
  try {
    execSync(`npx react-router routes > ${JSON.stringify(tmpFile)} 2>/dev/null`, {
      cwd,
    });
    out = fs.readFileSync(tmpFile, "utf8");
  } catch {
    out = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile, "utf8") : "";
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  /** @type {string[]} */
  const stack = [];
  /** @type {{ path: string, routeModule: string }[]} */
  const routes = [];

  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    const open = trimmed.match(ROUTE_OPEN);
    if (open) {
      const segment = open[1];
      const routeModule = open[2].replace(/^routes\//, "app/routes/");
      const selfClosing = trimmed.endsWith("/>");
      if (segment) {
        stack.push(segment);
      }
      const joined = stack.join("/");
      if (joined.startsWith("api/")) {
        routes.push({ path: `/${joined}`, routeModule });
      }
      if (segment && selfClosing) {
        stack.pop();
      }
      continue;
    }
    if (ROUTE_CLOSE.test(trimmed)) {
      stack.pop();
    }
  }

  return routes.sort((a, b) =>
    a.path === b.path
      ? a.routeModule.localeCompare(b.routeModule)
      : a.path.localeCompare(b.path),
  );
}

/**
 * @param {{ path: string, routeModule: string }[]} routes
 * @returns {Map<string, string[]>}
 */
export function groupRouteModulesByPath(routes) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const { path, routeModule } of routes) {
    const list = map.get(path) ?? [];
    list.push(routeModule);
    map.set(path, list);
  }
  return map;
}
