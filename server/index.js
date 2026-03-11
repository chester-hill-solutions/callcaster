/* eslint-env node */

import "dotenv/config";
import compression from "compression";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler } from "@remix-run/express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BUILD_PATH = path.resolve(ROOT_DIR, "build/index.js");
const PUBLIC_DIR = path.resolve(ROOT_DIR, "public");
const PUBLIC_BUILD_DIR = path.resolve(PUBLIC_DIR, "build");
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const SHUTDOWN_GRACE_PERIOD_MS = 10_000;
const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "BASE_URL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
];

export function validateEnvironment(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export async function loadBuild(buildPath = BUILD_PATH) {
  return import(pathToFileURL(buildPath).href);
}

function log(level, message, details) {
  const timestamp = new Date().toISOString();
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${payload}`;

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

function buildRequestLogger() {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = request.get("x-request-id") || randomUUID();

    request.id = requestId;
    response.setHeader("x-request-id", requestId);

    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      log("info", "request completed", {
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      });
    });

    next();
  };
}

export function createApp({
  build,
  mode = process.env.NODE_ENV ?? "production",
  readyState = { acceptingTraffic: true },
  remixHandler,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(compression());
  app.use(buildRequestLogger());
  app.use(
    "/build",
    express.static(PUBLIC_BUILD_DIR, {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: "1h",
    }),
  );

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get("/readyz", (_request, response) => {
    if (!readyState.acceptingTraffic) {
      response.status(503).json({ ok: false });
      return;
    }

    response.status(200).json({ ok: true });
  });

  const handleRemixRequest =
    remixHandler ??
    createRequestHandler({
      build,
      mode,
    });

  app.all("*", handleRemixRequest);

  return app;
}

export function createHttpServer(app) {
  const server = createServer(app);

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 300_000;

  if ("maxRequestsPerSocket" in server) {
    server.maxRequestsPerSocket = 1_000;
  }

  return server;
}

export async function startServer({
  host = HOST,
  port = PORT,
  env = process.env,
  buildPath = BUILD_PATH,
} = {}) {
  validateEnvironment(env);

  const build = await loadBuild(buildPath);
  const readyState = { acceptingTraffic: true };
  const app = createApp({ build, mode: env.NODE_ENV ?? "production", readyState });
  const server = createHttpServer(app);
  const sockets = new Set();

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  log("info", "server listening", { host, port });

  let shutdownPromise = null;

  const shutdown = async (signal, exitCode = 0) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      readyState.acceptingTraffic = false;
      log("warn", "shutdown started", { signal });

      const forceCloseTimer = setTimeout(() => {
        log("warn", "forcing socket close", { openSockets: sockets.size });
        for (const socket of sockets) {
          socket.destroy();
        }
      }, SHUTDOWN_GRACE_PERIOD_MS);

      forceCloseTimer.unref();

      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });

      clearTimeout(forceCloseTimer);
      log("info", "shutdown finished", { signal });
      process.exit(exitCode);
    })().catch((error) => {
      log("error", "shutdown failed", {
        signal,
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });

    return shutdownPromise;
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });
  process.on("uncaughtException", (error) => {
    log("error", "uncaught exception", {
      message: error instanceof Error ? error.message : String(error),
    });
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    log("error", "unhandled rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
    });
    void shutdown("unhandledRejection", 1);
  });

  return { app, server, shutdown, readyState };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    log("error", "server boot failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
