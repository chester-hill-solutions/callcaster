/* eslint-env node */

import "dotenv/config";
import compression from "compression";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler } from "@react-router/express";
import { validateRequiredEnv } from "../app/lib/required-env-keys.mjs";
import { tsImport } from "tsx/esm/api";
import { Readable } from "node:stream";

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

const TWILIO_WEBHOOK_PATH_PREFIXES = [
  "/api/call",
  "/api/dial",
  "/api/inbound",
  "/api/inbound-handset",
  "/api/inbound-ivr",
  "/api/ivr",
  "/api/call-status",
  "/api/auto-dial",
  "/api/acd-router",
  "/api/recording",
  "/api/sms/status",
  "/api/caller-id/status",
  "/api/email-vm",
  "/api/connect-campaign-conference",
];

const MAX_RAW_BODY_BYTES = 1 * 1024 * 1024;

const HANGUP_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

let requireTwilioSignature;

async function loadRequireTwilioSignature() {
  if (!requireTwilioSignature) {
    const mod = await tsImport(
      "../app/lib/twilio-webhook.server.ts",
      import.meta.url,
    );
    requireTwilioSignature = mod.requireTwilioSignature;
  }
  return requireTwilioSignature;
}

function isTwilioWebhookPath(pathname) {
  return TWILIO_WEBHOOK_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_RAW_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Request aborted")));
  });
}

function createRequestFromRaw(req, body) {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost";
  const url = new URL(`${protocol}://${host}${req.originalUrl}`);
  return new Request(url.href, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    duplex: "half",
  });
}

function resolveTwilioWebhookOptions(request, body) {
  const pathname = new URL(request.url).pathname;
  const params =
    request.method === "GET" || request.method === "HEAD"
      ? new URL(request.url).searchParams
      : new URLSearchParams(body.toString());

  if (
    pathname.startsWith("/api/caller-id/status") ||
    pathname.startsWith("/api/inbound")
  ) {
    const phone = params.get("Called") || params.get("To") || "";
    if (phone) return { phoneNumber: phone };
  }

  if (pathname.startsWith("/api/sms/status")) {
    const sid = params.get("SmsSid") || params.get("MessageSid") || "";
    if (sid) return { messageSid: sid };
  }

  const callSid = params.get("CallSid") || "";
  if (callSid) return { callSid };

  return {};
}

function createReqWithBody(originalReq, body) {
  const stream = new Readable();
  stream.push(body);
  stream.push(null);
  return new Proxy(stream, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      const streamValue = Reflect.get(target, prop, receiver);
      if (streamValue !== undefined || prop in target) {
        return typeof streamValue === "function"
          ? streamValue.bind(target)
          : streamValue;
      }
      const originalValue = originalReq[prop];
      return typeof originalValue === "function"
        ? originalValue.bind(originalReq)
        : originalValue;
    },
  });
}

function createTwilioWebhookMiddleware(handleRemixRequest) {
  return async (req, res, next) => {
    const pathname = req.path ?? req.url;
    if (!isTwilioWebhookPath(pathname)) {
      return next();
    }

    if (pathname.startsWith("/api/docs")) {
      return next();
    }

    if (
      req.method !== "GET" &&
      req.method !== "POST" &&
      req.method !== "HEAD"
    ) {
      return next();
    }

    try {
      const body =
        req.method === "GET" || req.method === "HEAD"
          ? Buffer.from("")
          : await readRawBody(req);
      const request = createRequestFromRaw(req, body);
      const options = resolveTwilioWebhookOptions(request, body);
      const fn = await loadRequireTwilioSignature();
      const forbidden = await fn(request, options);

      if (forbidden) {
        const bodyText = await forbidden.text();
        res
          .status(forbidden.status)
          .set(
            "Content-Type",
            forbidden.headers.get("Content-Type") || "text/xml",
          )
          .send(bodyText);
        return;
      }

      const newReq = createReqWithBody(req, body);
      await handleRemixRequest(newReq, res, next);
    } catch (error) {
      log("error", "Twilio webhook middleware error", {
        path: pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(403).set("Content-Type", "text/xml").send(HANGUP_TWIML);
    }
  };
}

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

function securityHeaders() {
  return (_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  };
}

function buildRequestLogger() {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = request.get("x-request-id") || randomUUID();

    request.id = requestId;
    response.setHeader("x-request-id", requestId);

    response.on("finish", () => {
      const pathname = request.path ?? request.url;
      if (PROBE_PATHS.has(pathname)) {
        return;
      }

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
  configureApp,
  mode = process.env.NODE_ENV ?? "production",
  readyState = { acceptingTraffic: true, buildReady: false },
  remixHandler,
  serveBuildAssets = true,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(securityHeaders());
  app.use(compression());
  app.use(buildRequestLogger());

  if (serveBuildAssets) {
    app.use(
      "/assets",
      express.static(CLIENT_ASSETS_DIR, {
        immutable: true,
        maxAge: "1y",
      }),
    );
    app.use(
      express.static(CLIENT_BUILD_DIR, {
        maxAge: "1h",
      }),
    );
  }

  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: "1h",
    }),
  );

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get("/readyz", (_request, response) => {
    if (!readyState.buildReady || !readyState.acceptingTraffic) {
      response.status(503).json({
        ok: false,
        buildReady: Boolean(readyState.buildReady),
        acceptingTraffic: Boolean(readyState.acceptingTraffic),
      });
      return;
    }

    response.status(200).json({ ok: true });
  });

  configureApp?.(app);

  const handleRemixRequest =
    remixHandler ??
    createRequestHandler({
      build,
      mode,
    });

  app.use(createTwilioWebhookMiddleware(handleRemixRequest));
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

  const readyState = { acceptingTraffic: false, buildReady: false };
  const build = await loadBuild(buildPath);
  readyState.buildReady = true;

  // DB schema health check: fail loudly if required RPC/triggers are missing/wrong.
  try {
    await import("tsx");
    const { assertRequiredDbFunctions } = await import("../app/server/db-health.server.ts");
    await assertRequiredDbFunctions();
  } catch (error) {
    log("error", "database schema health check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  readyState.acceptingTraffic = true;

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
    if (FATAL_ON_REJECTION) {
      void shutdown("unhandledRejection", 1);
    }
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
