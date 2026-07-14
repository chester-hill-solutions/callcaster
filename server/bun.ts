#!/usr/bin/env bun
/* eslint-env node */
/// <reference types="bun" />

import "dotenv/config";
import { createRequestHandler } from "react-router";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRequiredEnv } from "../app/lib/required-env-keys.mjs";
import { runWithRequestContext } from "../app/lib/request-context.server.ts";
import {
  captureException,
  initializeSentry,
} from "../app/lib/sentry.server.ts";
import type { DatabaseReadiness } from "../app/server/db-health.server.ts";
import { isTwilioWebhookPath } from "./twilio-webhook-paths.ts";
import { runBootSmokeChecks } from "../app/server/boot-checks.server.ts";
type TwilioWebhookModule = typeof import("./twilio-webhook.ts");
let twilioWebhookModule: TwilioWebhookModule | null = null;

async function getTwilioWebhookModule() {
  twilioWebhookModule ??= await import("./twilio-webhook.ts");
  return twilioWebhookModule;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BUILD_PATH = path.resolve(ROOT_DIR, "build/server/index.js");
const PUBLIC_DIR = path.resolve(ROOT_DIR, "public");
const CLIENT_BUILD_DIR = path.resolve(ROOT_DIR, "build/client");
const CLIENT_ASSETS_DIR = path.resolve(CLIENT_BUILD_DIR, "assets");
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const SHUTDOWN_GRACE_PERIOD_MS = 10_000;
const PROBE_PATHS = new Set(["/healthz", "/readyz"]);
const FATAL_ON_REJECTION =
  process.env.PROCESS_FATAL_ON_REJECTION === "1" ||
  process.env.PROCESS_FATAL_ON_REJECTION === "true";

export type ReadyState = {
  acceptingTraffic: boolean;
  buildReady: boolean;
};

export function validateEnvironment(env = process.env) {
  validateRequiredEnv(env);

  // BASE_URL drives every Twilio callback URL — a malformed or localhost value
  // boots cleanly but silently breaks all inbound webhooks in production.
  const baseUrl = env.BASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`BASE_URL is not a valid URL: "${baseUrl}"`);
  }
  if (env.NODE_ENV === "production" && env.E2E_TEST !== "1") {
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    if (localHosts.has(parsed.hostname)) {
      throw new Error(
        `BASE_URL points at ${parsed.hostname} in production — Twilio cannot reach it. Set it to the public HTTPS URL.`,
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        `BASE_URL must be https:// in production (got ${parsed.protocol}//) — Twilio webhook signatures are computed over the exact URL.`,
      );
    }
    if (!env.STRIPE_WEBHOOK_SECRET) {
      // Not fatal (review envs run without Stripe), but this is the config gap
      // where customers get charged and never receive credits.
      log("error", "STRIPE_WEBHOOK_SECRET is not set in production — Stripe checkout webhooks will 503 and paid credits will NOT be granted");
    }
  }
}

export async function loadBuild(buildPath = BUILD_PATH) {
  return import(pathToFileURL(buildPath).href);
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  details?: unknown,
) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...(details && typeof details === "object"
      ? details
      : { detail: details }),
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

function requestLogger(request: Request) {
  const startedAt = process.hrtime.bigint();
  const requestId = request.headers.get("x-request-id") || randomUUID();

  return {
    requestId,
    startedAt,
    finish: (response: Response) => {
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (PROBE_PATHS.has(pathname)) {
        return;
      }

      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const status = response.status;

      log("info", "request completed", {
        requestId,
        method: request.method,
        path: pathname,
        statusCode: status,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    },
  };
}

function applySecurityHeaders(response: Response) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
}

function finalizeResponse(response: Response, requestId: string) {
  applySecurityHeaders(response);
  response.headers.set("x-request-id", requestId);
  return response;
}

function resolveSafeFile(rootDir: string, urlPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decodedPath.includes("\0")) {
    return null;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(rootDir, relativePath));
  const rootWithSep = `${rootDir}${path.sep}`;

  if (filePath !== rootDir && !filePath.startsWith(rootWithSep)) {
    return null;
  }

  return filePath;
}

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
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

async function serveStaticFile(
  rootDir: string,
  urlPath: string,
  cacheControl: string,
): Promise<Response | null> {
  const filePath = resolveSafeFile(rootDir, urlPath);
  if (!filePath) {
    return null;
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  return new Response(file, {
    headers: {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": cacheControl,
    },
  });
}

const DB_PING_CACHE_MS = 10_000;

type DbReadinessChecker = () => Promise<DatabaseReadiness>;

function createDbReadinessChecker(): DbReadinessChecker {
  let cache: { at: number; readiness: DatabaseReadiness } | null = null;
  let inflight: Promise<DatabaseReadiness> | null = null;

  return () => {
    if (cache && Date.now() - cache.at < DB_PING_CACHE_MS) {
      return Promise.resolve(cache.readiness);
    }

    inflight ??= (async () => {
      try {
        const { probeDatabaseReadiness } = await import(
          "../app/server/db-health.server.ts"
        );
        const readiness = await probeDatabaseReadiness();
        cache = { at: Date.now(), readiness };
        return readiness;
      } catch {
        const readiness = { queryReady: false, listenReady: false };
        cache = { at: Date.now(), readiness };
        return readiness;
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  };
}

async function probeResponse(
  pathname: string,
  readyState: ReadyState,
  checkDb: DbReadinessChecker | null,
): Promise<Response> {
  if (pathname === "/healthz") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const database = checkDb
    ? await checkDb()
    : { queryReady: true, listenReady: true };
  const dbReady = database.queryReady && database.listenReady;

  if (!readyState.buildReady || !readyState.acceptingTraffic || !dbReady) {
    return new Response(
      JSON.stringify({
        ok: false,
        buildReady: Boolean(readyState.buildReady),
        acceptingTraffic: Boolean(readyState.acceptingTraffic),
        databaseReady: database.queryReady,
        databaseListenReady: database.listenReady,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export type CreateServerOptions = {
  build?: Awaited<ReturnType<typeof loadBuild>>;
  buildPath?: string;
  host?: string;
  port?: number;
  readyState?: ReadyState;
  requestHandler?: (request: Request) => Promise<Response>;
  serveBuildAssets?: boolean;
  skipDbHealthCheck?: boolean;
};

export async function createServer(options: CreateServerOptions = {}) {
  const readyState = options.readyState ?? {
    acceptingTraffic: true,
    buildReady: true,
  };
  const build =
    options.build ??
    (await (async () => {
      readyState.buildReady = false;
      const loaded = await loadBuild(options.buildPath);
      readyState.buildReady = true;
      return loaded;
    })());

  if (!options.skipDbHealthCheck) {
    try {
      const { assertRequiredDbFunctions } = await import(
        "../app/server/db-health.server.ts"
      );
      await assertRequiredDbFunctions();
    } catch (error) {
      log("error", "database schema health check failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  const requestHandler =
    options.requestHandler ?? createRequestHandler(build, "production");
  const serveBuildAssets = options.serveBuildAssets ?? true;
  const dbReadinessChecker = options.skipDbHealthCheck
    ? null
    : createDbReadinessChecker();

  return Bun.serve({
    hostname: options.host ?? HOST,
    port: options.port ?? PORT,
    fetch: async (request) => {
      const logger = requestLogger(request);
      const url = new URL(request.url);
      const pathname = url.pathname;

      return runWithRequestContext({ requestId: logger.requestId }, async () => {
        try {
        if (pathname === "/healthz" || pathname === "/readyz") {
          const response = finalizeResponse(
            await probeResponse(pathname, readyState, dbReadinessChecker),
            logger.requestId,
          );
          logger.finish(response);
          return response;
        }

        if (serveBuildAssets && pathname.startsWith("/assets/")) {
          const assetResponse = await serveStaticFile(
            CLIENT_ASSETS_DIR,
            pathname.slice("/assets/".length),
            "public, max-age=31536000, immutable",
          );
          if (assetResponse) {
            const response = finalizeResponse(assetResponse, logger.requestId);
            logger.finish(response);
            return response;
          }
        }

        if (serveBuildAssets) {
          const clientResponse = await serveStaticFile(
            CLIENT_BUILD_DIR,
            pathname,
            "public, max-age=3600",
          );
          if (clientResponse) {
            const response = finalizeResponse(clientResponse, logger.requestId);
            logger.finish(response);
            return response;
          }
        }

        const publicResponse = await serveStaticFile(
          PUBLIC_DIR,
          pathname,
          "public, max-age=3600",
        );
        if (publicResponse) {
          const response = finalizeResponse(publicResponse, logger.requestId);
          logger.finish(response);
          return response;
        }

        if (isTwilioWebhookPath(pathname)) {
          const { handleTwilioWebhookRequest } = await getTwilioWebhookModule();
          const twilioResult = await handleTwilioWebhookRequest(request);
          if (twilioResult.kind === "response") {
            const response = finalizeResponse(
              twilioResult.response,
              logger.requestId,
            );
            logger.finish(response);
            return response;
          }

          const rrRequest =
            twilioResult.kind === "validated" ? twilioResult.request : request;
          const rrResponse = await requestHandler(rrRequest);
          const response = finalizeResponse(rrResponse, logger.requestId);
          logger.finish(response);
          return response;
        }

        const rrResponse = await requestHandler(request);
        const response = finalizeResponse(rrResponse, logger.requestId);
        logger.finish(response);
        return response;
        } catch (error) {
          log("error", "Unhandled request error", {
            error: error instanceof Error ? error.message : String(error),
            path: pathname,
            requestId: logger.requestId,
          });
          captureException(error, {
            path: pathname,
            method: request.method,
            requestId: logger.requestId,
          });

          const response = finalizeResponse(
            new Response(JSON.stringify({ error: "Internal Server Error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }),
            logger.requestId,
          );
          logger.finish(response);
          return response;
        }
      });
    },
    error: (error) => {
      log("error", "Bun server error", {
        error: error instanceof Error ? error.message : String(error),
      });
      captureException(error, { source: "bun.server.error" });
      return new Response("Internal Server Error", { status: 500 });
    },
  });
}

function gracefulShutdown(server: ReturnType<typeof Bun.serve>, readyState: ReadyState) {
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    readyState.acceptingTraffic = false;

    log("warn", "shutdown started", { signal });

    const timer = setTimeout(() => {
      log("warn", "Graceful shutdown timeout exceeded. Force exiting.");
      process.exit(1);
    }, SHUTDOWN_GRACE_PERIOD_MS);

    try {
      server.stop(true);
      clearTimeout(timer);
      log("info", "shutdown finished", { signal });
      process.exit(exitCode);
    } catch (error) {
      log("error", "Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      clearTimeout(timer);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.on("uncaughtException", (error) => {
    log("error", "uncaught exception", {
      message: error instanceof Error ? error.message : String(error),
    });
    captureException(error, { source: "uncaughtException" });
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    log("error", "unhandled rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
    });
    captureException(reason, { source: "unhandledRejection" });
    if (FATAL_ON_REJECTION) {
      void shutdown("unhandledRejection", 1);
    }
  });
}

export async function startServer({
  host = HOST,
  port = PORT,
  env = process.env,
  buildPath = BUILD_PATH,
}: {
  host?: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
  buildPath?: string;
} = {}) {
  initializeSentry("callcaster-web", env);
  validateEnvironment(env);

  const readyState: ReadyState = {
    acceptingTraffic: false,
    buildReady: false,
  };

  const server = await createServer({
    buildPath,
    host,
    port,
    readyState,
  });

  readyState.acceptingTraffic = true;
  gracefulShutdown(server, readyState);

  log("info", "server listening", { host, port });

  // Fire-and-forget: never delays or blocks readiness, and never throws.
  void runBootSmokeChecks(env).catch((error) => {
    log("error", "boot smoke checks failed unexpectedly", {
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return { server, readyState, shutdown: () => server.stop(true) };
}

async function main() {
  try {
    await startServer();
  } catch (error) {
    log("error", "server boot failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    captureException(error, { source: "server.boot" });
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
