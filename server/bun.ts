#!/usr/bin/env bun
/* eslint-env node */
/// <reference types="bun" />

import "dotenv/config";
import { createRequestHandler } from "@react-router/express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRequiredEnv } from "../app/lib/required-env-keys.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BUILD_PATH = path.resolve(ROOT_DIR, "build/server/index.js");
const CLIENT_BUILD_DIR = path.resolve(ROOT_DIR, "build/client");
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const SHUTDOWN_GRACE_PERIOD_MS = 10_000;
const PROBE_PATHS = new Set(["/healthz", "/readyz"]);

export function validateEnvironment(env = process.env) {
  validateRequiredEnv(env);
}

export async function loadBuild(buildPath = BUILD_PATH) {
  return import(pathToFileURL(buildPath).href);
}

function log(level, message, details) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...(details && typeof details === "object" ? details : { detail: details }),
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function requestLogger(request) {
  const startedAt = process.hrtime.bigint();
  const requestId = request.headers.get("x-request-id") || randomUUID();

  return {
    requestId,
    startedAt,
    finish: (response) => {
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (PROBE_PATHS.has(pathname)) {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const status = response.status;

      log("info", "request", {
        requestId,
        method: request.method,
        path: pathname,
        status,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    },
  };
}

function securityHeaders(response) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
}

function serveFile(filePath, mimeType) {
  const file = Bun.file(filePath);
  if (!file.exists) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".otf": "font/otf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function createServer() {
  const build = await loadBuild();

  // DB schema health check: fail loudly if required RPC/triggers are missing/wrong.
  try {
    const { assertRequiredDbFunctions } = await import("../app/server/db-health.server.ts");
    await assertRequiredDbFunctions();
  } catch (error) {
    log("error", "database schema health check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  const requestHandler = createRequestHandler({
    build,
    mode: "production",
  });

  return Bun.serve({
    hostname: HOST,
    port: PORT,
    fetch: async (request) => {
      const logger = requestLogger(request);
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Static files
      if (pathname.startsWith("/assets/")) {
        const filePath = path.join(CLIENT_BUILD_DIR, pathname);
        const response = serveFile(filePath, getMimeType(pathname));
        securityHeaders(response);
        logger.finish(response);
        return response;
      }

      if (pathname === "/healthz" || pathname === "/readyz") {
        const response = new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        securityHeaders(response);
        logger.finish(response);
        return response;
      }

      // React Router request handler
      try {
        const rrResponse = await requestHandler(request);
        securityHeaders(rrResponse);
        logger.finish(rrResponse);
        return rrResponse;
      } catch (error) {
        log("error", "Unhandled request error", {
          error: error instanceof Error ? error.message : String(error),
          path: pathname,
        });

        const response = new Response(
          JSON.stringify({ error: "Internal Server Error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
        securityHeaders(response);
        return response;
      }
    },
    error: (error) => {
      log("error", "Bun server error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Internal Server Error", { status: 500 });
    },
  });
}

function gracefulShutdown(server) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    log("info", `${signal} received. Starting graceful shutdown...`);

    const timer = setTimeout(() => {
      log("warn", "Graceful shutdown timeout exceeded. Force exiting.");
      process.exit(1);
    }, SHUTDOWN_GRACE_PERIOD_MS);

    try {
      server.stop(true);
      log("info", "Server stopped gracefully.");
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      log("error", "Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      clearTimeout(timer);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function main() {
  try {
    validateEnvironment();
    const server = await createServer();
    gracefulShutdown(server);

    log("info", "Bun server listening", {
      host: HOST,
      port: PORT,
      url: `http://${HOST}:${PORT}`,
    });
  } catch (error) {
    log("error", "Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
